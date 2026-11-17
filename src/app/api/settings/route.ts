import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES, DEFAULT_CUSTOMER_TAGS } from "@/lib/constants";
import { getTaxRatePct } from "@/lib/settings";
import { z } from "zod";
import { createAuditLog } from "@/lib/audit";
import { serializeBigInt, toFaDigits } from "@/lib/utils";

// اسکیمای PATCH تنظیمات — اعتبارسنجی ورودی پیش از هر نوشتن
const settingsPatchSchema = z.object({
  regions: z.array(z.string().trim().min(1)).optional(),
  propertyTypes: z
    .array(z.object({ value: z.string().trim().min(1), label: z.string().trim().min(1) }))
    .optional(),
  customerTags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  renamePropertyType: z.object({ from: z.string().trim().min(1), to: z.string().trim().min(1) }).optional(),
});
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const regionsRow = await prisma.appSetting.findUnique({ where: { key: "regions" } });
  const typesRow = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
  const tagsRow = await prisma.appSetting.findUnique({ where: { key: "customerTags" } });
  const regions = regionsRow ? JSON.parse(regionsRow.value) : DEFAULT_BUSHEHR_REGIONS;
  const propertyTypes = typesRow ? JSON.parse(typesRow.value) : DEFAULT_PROPERTY_TYPES;
  const customerTags = tagsRow ? JSON.parse(tagsRow.value) : DEFAULT_CUSTOMER_TAGS;
  const taxRate = await getTaxRatePct();
  return NextResponse.json(serializeBigInt({ regions, propertyTypes, customerTags, taxRate }));
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "فقط مدیر" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بدنهٔ درخواست معتبر نیست" }, { status: 400 });
  }
  // اعتبارسنجی ورودی پیش از هر نوشتن؛ درخواست نامعتبر هیچ تغییری ندارد
  // قبلا regions پیش از اعتبارسنجی taxRate نوشته شد و درخواست ۴۰۰ برگشت
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "ورودی تنظیمات معتبر نیست" }, { status: 400 });
  }
  const input = parsed.data;

  // خواندن لیست فعلی نوع ملک — برای تغییر نام و بررسی انجماد لازم است
  const typesRow = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
  const currentTypes: { value: string; label: string }[] = typesRow
    ? JSON.parse(typesRow.value)
    : DEFAULT_PROPERTY_TYPES;

  // آماده کردن تغییر نام نوع ملک — فقط محاسبه، بدون نوشتن
  let rename: { from: string; to: string; properties: number; customers: number } | null = null;
  let renamedTypes: { value: string; label: string }[] | null = null;
  if (input.renamePropertyType) {
    const from = input.renamePropertyType.from.toUpperCase();
    const to = input.renamePropertyType.to.toUpperCase();
    if (!/^[A-Z_]+$/.test(to)) {
      return NextResponse.json({ error: "کد جدید نوع ملک فقط حروف بزرگ انگلیسی و _ باشد" }, { status: 400 });
    }
    if (from === to) {
      rename = { from, to, properties: 0, customers: 0 };
    } else {
      if (!currentTypes.some((t) => t.value === from)) {
        return NextResponse.json({ error: "نوع موردنظر یافت نشد" }, { status: 400 });
      }
      if (currentTypes.some((t) => t.value === to)) {
        return NextResponse.json({ error: "نوعی با این کد از قبل وجود دارد" }, { status: 400 });
      }
      const [propCount, custCount] = await Promise.all([
        prisma.property.count({ where: { type: from } }),
        prisma.customer.count({ where: { preferredType: from } }),
      ]);
      rename = { from, to, properties: propCount, customers: custCount };
      renamedTypes = currentTypes.map((t) => (t.value === from ? { ...t, value: to } : t));
    }
  }

  // انجماد نوع ملک: حذف نوع دارای فایل مسدود است — وگرنه فایل یتیم ماند
  let nextTypes: { value: string; label: string }[] | null = null;
  if (input.propertyTypes) {
    const baseTypes = renamedTypes ?? currentTypes;
    const newValues = new Set(input.propertyTypes.map((t) => t.value));
    for (const t of baseTypes) {
      if (newValues.has(t.value)) continue;
      // شمارش با کد قدیمی برای نوعی که در همین درخواست تغییر نام داد
      const countType = rename && t.value === rename.to ? rename.from : t.value;
      const used = await prisma.property.count({ where: { type: countType, deletedAt: null } });
      if (used > 0) {
        return NextResponse.json(
          { error: `نوع «${t.label}» روی ${toFaDigits(String(used))} فایل استفاده شده است و حذف آن ممکن نیست — اول نوع آن فایل را عوض کنید یا کد نوع را تغییر نام دهید` },
          { status: 400 }
        );
      }
    }
    nextTypes = input.propertyTypes;
  }

  // مقدار قبلی نرخ مالیات برای ثبت تغییر در audit log
  let prevTaxRate: number | null = null;
  if (input.taxRate !== undefined) {
    const taxRow = await prisma.appSetting.findUnique({ where: { key: "taxRate" } });
    if (taxRow) {
      const n = Number(JSON.parse(taxRow.value));
      prevTaxRate = Number.isFinite(n) ? n : null;
    }
  }

  // تمام نوشتن در یک تراکنش: یا ورودی کامل اعمال شود یا هیچ چیز
  await prisma.$transaction(async (tx) => {
    if (rename && renamedTypes) {
      await tx.property.updateMany({ where: { type: rename.from }, data: { type: rename.to } });
      await tx.customer.updateMany({ where: { preferredType: rename.from }, data: { preferredType: rename.to } });
    }
    const finalTypes = nextTypes ?? renamedTypes;
    if (finalTypes) {
      await tx.appSetting.upsert({
        where: { key: "propertyTypes" },
        update: { value: JSON.stringify(finalTypes) },
        create: { key: "propertyTypes", value: JSON.stringify(finalTypes) },
      });
    }
    if (input.regions) {
      const regions = [...new Set(input.regions)];
      await tx.appSetting.upsert({
        where: { key: "regions" },
        update: { value: JSON.stringify(regions) },
        create: { key: "regions", value: JSON.stringify(regions) },
      });
    }
    if (input.taxRate !== undefined) {
      await tx.appSetting.upsert({
        where: { key: "taxRate" },
        update: { value: JSON.stringify(input.taxRate) },
        create: { key: "taxRate", value: JSON.stringify(input.taxRate) },
      });
    }
    if (input.customerTags !== undefined) {
      const tags = [...new Set(input.customerTags)];
      await tx.appSetting.upsert({
        where: { key: "customerTags" },
        update: { value: JSON.stringify(tags) },
        create: { key: "customerTags", value: JSON.stringify(tags) },
      });
    }
  });

  if (input.taxRate !== undefined && prevTaxRate !== input.taxRate) {
    await createAuditLog({
      actorId: session.user.id,
      action: "SETTINGS_TAX_RATE_CHANGED",
      entityType: "AppSetting",
      entityId: "taxRate",
      oldValue: { taxRate: prevTaxRate },
      newValue: { taxRate: input.taxRate },
    });
  }

  return NextResponse.json({ ok: true, ...(rename ? { renamed: rename } : {}) });
}
