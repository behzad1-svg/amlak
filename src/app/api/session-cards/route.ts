import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { sessionCardCreateSchema, findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { formatJalaliDateTime } from "@/lib/jalali";
import { normalizeCoAdvisorIds } from "@/lib/sessionCards";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";
import { sendSms, sessionCardSmsText } from "@/lib/sms";

const CARD_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  property: { select: { id: true, title: true, code: true, owner: { select: { id: true, name: true } } } },
  advisor: { select: { id: true, name: true } },
  coAdvisors: { select: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" as const } },
  contractManager: { select: { id: true, name: true } },
};

/** شمارهٔ مدیر اصلی (محمد ادیم) — پیامک کارت جلسه همیشه به او هم می‌رود.
 *  کاربر با شماره پیدا می‌شود تا شناسه‌اش در کد قفل نشود. */
const MAIN_MANAGER_PHONE = "09173700135";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  if (status && !["PENDING", "CONFIRMED", "CANCELLED"].includes(status)) {
    return NextResponse.json({ error: "وضعیت معتبر نیست" }, { status: 400 });
  }
  const invalidParam = findInvalidQueryParam([{ name: "limit", value: searchParams.get("limit") }]);
  if (invalidParam) return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  // مدیر همه کارت‌ها را می‌بیند؛ مشاور کارت‌های خودش، کارت‌هایی که در آن‌ها مشاور همکار است و کارت‌هایی که مدیر قراردادشان است را
  if (session.user.role !== "OWNER") {
    where.OR = [{ advisorId: session.user.id }, { coAdvisors: { some: { userId: session.user.id } } }, { contractManagerId: session.user.id }];
  }
  const cards = await prisma.sessionCard.findMany({
    where,
    include: CARD_INCLUDE,
    orderBy: { scheduledAt: "desc" },
    take: limit,
  });
  return NextResponse.json(serializeBigInt(cards));
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = sessionCardCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const scheduledAt = new Date(d.scheduledAt);
  if (isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "تاریخ و ساعت جلسه معتبر نیست" }, { status: 400 });

  const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
  let property = null;
  if (d.propertyId) {
    property = await prisma.property.findUnique({
      where: { id: d.propertyId },
      include: { owner: { select: { id: true, name: true } } },
    });
    if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
  }

  // گارد بین‌مشاوری — مثل بازدیدها: مشاور فقط مشتری خودش و فایل در دسترس خودش
  if (session.user.role !== "OWNER") {
    if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    if (property) {
      const canAccessProp =
        property.listedById === session.user.id ||
        property.visibility === "TEAM_VISIBLE" ||
        property.isOfficeFile ||
        (await hasRestrictedAccess(prisma as never, property.id, session.user.id));
      if (!canAccessProp) return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
    }
  }

  // اعتبارسنجی مشاورهای همکار و مدیر قرارداد
  const cooperatingAdvisorIds = normalizeCoAdvisorIds(d.cooperatingAdvisorIds, session.user.id);
  if (cooperatingAdvisorIds.length > 0) {
    const coops = await prisma.user.findMany({
      where: { id: { in: cooperatingAdvisorIds }, active: true },
      select: { id: true },
    });
    if (coops.length !== cooperatingAdvisorIds.length)
      return NextResponse.json({ error: "مشاور همکار معتبر نیست" }, { status: 400 });
  }
  let contractManager = null;
  if (d.contractManagerId) {
    contractManager = await prisma.user.findUnique({
      where: { id: d.contractManagerId },
      select: { id: true, active: true, isContractManager: true, phone: true },
    });
    if (!contractManager || !contractManager.active || !contractManager.isContractManager)
      return NextResponse.json({ error: "مدیر قرارداد معتبر نیست" }, { status: 400 });
  }

  const card = await prisma.sessionCard.create({
    data: {
      customerId: d.customerId,
      propertyId: d.propertyId || null,
      advisorId: session.user.id,
      coAdvisors: { create: cooperatingAdvisorIds.map((userId) => ({ userId })) },
      contractManagerId: d.contractManagerId || null,
      scheduledAt,
      cashAmountToman: d.cashAmountToman ? BigInt(d.cashAmountToman) : null,
      depositAmountToman: d.depositAmountToman ? BigInt(d.depositAmountToman) : null,
      rentAmountToman: d.rentAmountToman ? BigInt(d.rentAmountToman) : null,
      intent: d.intent || null,
      sellerShiriniToman: d.sellerShiriniToman ? BigInt(d.sellerShiriniToman) : null,
      depositPaid: d.depositPaid ?? null,
      paymentTerms: d.paymentTerms || null,
      notes: d.notes || null,
    },
    include: CARD_INCLUDE,
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "SESSION_CARD_CREATED",
    entityType: "SessionCard",
    entityId: card.id,
    newValue: { customerId: d.customerId, propertyId: d.propertyId ?? null, scheduledAt: d.scheduledAt } as never,
  });
  // فعالیت «کارت جلسه» — مثل کارشناسی و آگهی: ثبت کارت در گزارش عملکرد سازندهٔ آن حساب می‌شود
  const fileLabelForActivity = property ? (property.code ? `${property.code} — ${property.title}` : property.title) : "بدون فایل";
  await prisma.activity.create({
    data: {
      type: "SESSION_CARD",
      agentId: session.user.id,
      customerId: d.customerId,
      propertyId: d.propertyId || null,
      description: `کارت جلسه ثبت شد: ${customer.name} — ${fileLabelForActivity}`,
    },
  });
  // اعلان فوری HIGH برای همه مدیرها + مشاورهای همکار + مدیر قرارداد انتخاب‌شده
  const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { id: true } });
  const recipientIds = [...new Set([...owners.map((o) => o.id), ...cooperatingAdvisorIds, contractManager?.id].filter(Boolean))] as string[];
  if (recipientIds.length > 0) {
    const fileLabel = property ? (property.code ? `${property.code} — ${property.title}` : property.title) : "بدون فایل";
    await prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: "SESSION_CARD" as never,
        priority: "HIGH" as never,
        relatedType: "SessionCard",
        relatedId: card.id,
        message: `کارت جلسه تازه: ${customer.name} — ${fileLabel} — ${formatJalaliDateTime(scheduledAt)}`,
      })),
    });
  }
  // پیامک کارت جلسه — به مدیر اصلی (محمد ادیم) و مدیر قرارداد
  // انتخاب‌شده؛ بعد از ذخیرهٔ کارت، و هرگز مانع ثبت کارت نمی‌شود:
  // خطای هر پیامک فقط در لاگ سرور می‌ماند. اگر مدیر قرارداد همان
  // مدیر اصلی باشد (یک شماره)، فقط یک پیامک می‌رود.
  const smsRecipients = new Set<string>();
  try {
    const mainManager = await prisma.user.findUnique({
      where: { phone: MAIN_MANAGER_PHONE },
      select: { phone: true, active: true },
    });
    if (mainManager?.active && mainManager.phone) smsRecipients.add(mainManager.phone);
  } catch (e) {
    console.error("[session-card-sms] failed:", e instanceof Error ? e.message : "");
  }
  if (contractManager?.phone) smsRecipients.add(contractManager.phone);
  for (const mobile of smsRecipients) {
    try {
      await sendSms(mobile, sessionCardSmsText(session.user.name));
    } catch (e) {
      console.error("[session-card-sms] failed:", e instanceof Error ? e.message : "");
    }
  }
  return NextResponse.json(serializeBigInt(card), { status: 201 });
}
