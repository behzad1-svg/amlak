import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES, DEFAULT_CUSTOMER_TAGS } from "@/lib/constants";
import { getTaxRatePct } from "@/lib/settings";
import { serializeBigInt, toFaDigits } from "@/lib/utils";

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
  if (body.regions) {
    if (!Array.isArray(body.regions)) return NextResponse.json({ error: "regions باید آرایه باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "regions" }, update: { value: JSON.stringify(body.regions) }, create: { key: "regions", value: JSON.stringify(body.regions) } });
  }
  // تغییر نام نوع ملک (کد) — به‌روزرسانی تراکنشی همهٔ فایل‌ها و ترجیح مشتریان
  if (body.renamePropertyType !== undefined) {
    const r = body.renamePropertyType as { from?: unknown; to?: unknown };
    if (!r || typeof r !== "object" || typeof r.from !== "string" || typeof r.to !== "string") {
      return NextResponse.json({ error: "renamePropertyType باید { from, to } باشد" }, { status: 400 });
    }
    const from = r.from.trim().toUpperCase();
    const to = r.to.trim().toUpperCase();
    if (!/^[A-Z_]+$/.test(to)) {
      return NextResponse.json({ error: "کد جدید نوع ملک فقط حروف بزرگ انگلیسی و _ می‌تواند باشد" }, { status: 400 });
    }
    if (from === to) return NextResponse.json({ ok: true, renamed: { from, to, properties: 0, customers: 0 } });
    const curRow = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
    const current: { value: string; label: string }[] = curRow ? JSON.parse(curRow.value) : DEFAULT_PROPERTY_TYPES;
    if (!current.some((t) => t.value === from)) {
      return NextResponse.json({ error: "نوع موردنظر یافت نشد" }, { status: 400 });
    }
    if (current.some((t) => t.value === to)) {
      return NextResponse.json({ error: "نوعی با این کد از قبل وجود دارد" }, { status: 400 });
    }
    const [propCount, custCount] = await Promise.all([
      prisma.property.count({ where: { type: from } }),
      prisma.customer.count({ where: { preferredType: from } }),
    ]);
    const nextTypes = current.map((t) => (t.value === from ? { ...t, value: to } : t));
    await prisma.$transaction([
      prisma.property.updateMany({ where: { type: from }, data: { type: to } }),
      prisma.customer.updateMany({ where: { preferredType: from }, data: { preferredType: to } }),
      prisma.appSetting.upsert({ where: { key: "propertyTypes" }, update: { value: JSON.stringify(nextTypes) }, create: { key: "propertyTypes", value: JSON.stringify(nextTypes) } }),
    ]);
    return NextResponse.json({ ok: true, renamed: { from, to, properties: propCount, customers: custCount } });
  }
  if (body.propertyTypes) {
    if (!Array.isArray(body.propertyTypes)) return NextResponse.json({ error: "propertyTypes باید آرایه باشد" }, { status: 400 });
    // انجماد نوع‌ها: حذف نوعی که فایلی با آن کد دارد مسدود است — وگرنه فایل‌ها یتیم می‌شوند
    const curRow = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
    const current: { value: string; label: string }[] = curRow ? JSON.parse(curRow.value) : DEFAULT_PROPERTY_TYPES;
    const newValues = new Set((body.propertyTypes as { value: string }[]).map((t) => t.value));
    for (const t of current) {
      if (newValues.has(t.value)) continue;
      const used = await prisma.property.count({ where: { type: t.value, deletedAt: null } });
      if (used > 0) {
        return NextResponse.json(
          { error: `نوع «${t.label}» روی ${toFaDigits(String(used))} فایل استفاده شده است و نمی‌توان آن را حذف کرد — اول نوع آن فایل‌ها را عوض کنید یا کد نوع را تغییر نام دهید` },
          { status: 400 }
        );
      }
    }
    await prisma.appSetting.upsert({ where: { key: "propertyTypes" }, update: { value: JSON.stringify(body.propertyTypes) }, create: { key: "propertyTypes", value: JSON.stringify(body.propertyTypes) } });
  }
  if (body.taxRate !== undefined) {
    const n = Number(body.taxRate);
    if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "taxRate باید عددی بین ۰ تا ۱۰۰ باشد" }, { status: 400 });
    await prisma.appSetting.upsert({ where: { key: "taxRate" }, update: { value: JSON.stringify(n) }, create: { key: "taxRate", value: JSON.stringify(n) } });
  }
  if (body.customerTags !== undefined) {
    if (!Array.isArray(body.customerTags) || body.customerTags.length > 20 || body.customerTags.some((t: unknown) => typeof t !== "string" || !t.trim() || t.length > 30)) {
      return NextResponse.json({ error: "customerTags باید آرایه‌ای از رشته‌های حداکثر ۳۰ کاراکتری باشد" }, { status: 400 });
    }
    const tags = [...new Set(body.customerTags.map((t: string) => t.trim()))];
    await prisma.appSetting.upsert({ where: { key: "customerTags" }, update: { value: JSON.stringify(tags) }, create: { key: "customerTags", value: JSON.stringify(tags) } });
  }
  return NextResponse.json({ ok: true });
}
