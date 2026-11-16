import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { sessionCardUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";

const CARD_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  property: { select: { id: true, title: true, code: true, owner: { select: { id: true, name: true } } } },
  advisor: { select: { id: true, name: true } },
  cooperatingAdvisor: { select: { id: true, name: true } },
  contractManager: { select: { id: true, name: true } },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.sessionCard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "کارت جلسه یافت نشد" }, { status: 404 });
  const isOwner = session.user.role === "OWNER";
  const isCreator = existing.advisorId === session.user.id;
  if (!isOwner && !isCreator) return NextResponse.json({ error: "به این کارت دسترسی ندارید" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = sessionCardUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  // ویرایش محتوا در برابر تغییر وضعیت — جدا از هم
  const CONTENT_FIELDS = [
    "customerId",
    "propertyId",
    "scheduledAt",
    "cashAmountToman",
    "depositAmountToman",
    "rentAmountToman",
    "intent",
    "sellerShiriniToman",
    "cooperatingAdvisorId",
    "contractManagerId",
    "depositPaid",
    "paymentTerms",
    "notes",
  ] as const;
  const hasContent = CONTENT_FIELDS.some((k) => (d as Record<string, unknown>)[k] !== undefined);
  const hasStatusChange = d.status !== undefined || d.managerNote !== undefined;
  if (hasContent && hasStatusChange)
    return NextResponse.json({ error: "ویرایش و تغییر وضعیت را هم‌زمان نفرستید" }, { status: 400 });
  if (hasContent) {
    // ویرایش محتوا: فقط سازنده کارت و فقط تا پیش از تأیید
    if (!isCreator) return NextResponse.json({ error: "فقط سازندهٔ کارت می‌تواند آن را ویرایش کند" }, { status: 403 });
    if (existing.status === "CANCELLED") return NextResponse.json({ error: "این کارت لغو شده است و دیگر قابل تغییر نیست" }, { status: 400 });
    if (existing.status === "CONFIRMED")
      return NextResponse.json({ error: "این کارت تأیید شده است؛ برای تغییر باید لغو و دوباره ثبت شود" }, { status: 400 });
    let scheduledAt: Date | undefined;
    if (d.scheduledAt !== undefined) {
      scheduledAt = new Date(d.scheduledAt);
      if (isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "تاریخ و ساعت جلسه معتبر نیست" }, { status: 400 });
    }
    // گاردهای زمان ساخت برای مقدارهای تازه — مثل POST
    if (d.customerId !== undefined && d.customerId !== existing.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
      if (!customer || customer.deletedAt) return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
      if (!isOwner && !canAccessCustomer(session.user, customer))
        return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    }
    if (d.propertyId !== undefined && d.propertyId !== existing.propertyId) {
      if (d.propertyId) {
        const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
        if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
        if (!isOwner) {
          const canAccessProp =
            property.listedById === session.user.id ||
            property.visibility === "TEAM_VISIBLE" ||
            property.isOfficeFile ||
            (await hasRestrictedAccess(prisma as never, property.id, session.user.id));
          if (!canAccessProp) return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
        }
      }
    }
    if (d.cooperatingAdvisorId !== undefined && d.cooperatingAdvisorId) {
      const coop = await prisma.user.findUnique({ where: { id: d.cooperatingAdvisorId }, select: { id: true, active: true } });
      if (!coop || !coop.active) return NextResponse.json({ error: "مشاور همکار معتبر نیست" }, { status: 400 });
    }
    if (d.contractManagerId !== undefined && d.contractManagerId) {
      const cm = await prisma.user.findUnique({
        where: { id: d.contractManagerId },
        select: { id: true, active: true, isContractManager: true },
      });
      if (!cm || !cm.active || !cm.isContractManager)
        return NextResponse.json({ error: "مدیر قرارداد معتبر نیست" }, { status: 400 });
    }
    const data: Record<string, unknown> = {};
    if (d.customerId !== undefined) data.customerId = d.customerId;
    if (d.propertyId !== undefined) data.propertyId = d.propertyId || null;
    if (scheduledAt !== undefined) data.scheduledAt = scheduledAt;
    if (d.cashAmountToman !== undefined) data.cashAmountToman = d.cashAmountToman ? BigInt(d.cashAmountToman) : null;
    if (d.depositAmountToman !== undefined) data.depositAmountToman = d.depositAmountToman ? BigInt(d.depositAmountToman) : null;
    if (d.rentAmountToman !== undefined) data.rentAmountToman = d.rentAmountToman ? BigInt(d.rentAmountToman) : null;
    if (d.intent !== undefined) data.intent = d.intent || null;
    if (d.sellerShiriniToman !== undefined) data.sellerShiriniToman = d.sellerShiriniToman ? BigInt(d.sellerShiriniToman) : null;
    if (d.cooperatingAdvisorId !== undefined) data.cooperatingAdvisorId = d.cooperatingAdvisorId || null;
    if (d.contractManagerId !== undefined) data.contractManagerId = d.contractManagerId || null;
    if (d.depositPaid !== undefined) data.depositPaid = d.depositPaid ?? null;
    if (d.paymentTerms !== undefined) data.paymentTerms = d.paymentTerms || null;
    if (d.notes !== undefined) data.notes = d.notes || null;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "تغییری نفرستاده‌اید" }, { status: 400 });
    const card = await prisma.sessionCard.update({ where: { id }, data: data as never, include: CARD_INCLUDE });
    await createAuditLog({
      actorId: session.user.id,
      action: "SESSION_CARD_EDITED",
      entityType: "SessionCard",
      entityId: id,
      oldValue: { status: existing.status } as never,
      newValue: { status: card.status, editedFields: Object.keys(data) } as never,
    });
    return NextResponse.json(serializeBigInt(card));
  }
  // گذرهای مجاز: PENDING → CONFIRMED / CANCELLED و CONFIRMED → CANCELLED؛ لغوشده نهایی است
  if (existing.status === "CANCELLED") return NextResponse.json({ error: "این کارت لغو شده است و دیگر قابل تغییر نیست" }, { status: 400 });
  if (existing.status === "CONFIRMED" && d.status !== "CANCELLED") return NextResponse.json({ error: "این کارت قبلاً تأیید شده است؛ فقط می‌توان آن را لغو کرد" }, { status: 400 });
  // سازنده فقط می‌تواند کارت خودش را لغو کند؛ تأیید فقط با مدیر است
  if (!isOwner && d.status !== "CANCELLED") return NextResponse.json({ error: "فقط مدیر می‌تواند کارت جلسه را تأیید کند" }, { status: 403 });
  const data: Record<string, unknown> = {};
  if (d.status !== undefined) data.status = d.status;
  if (isOwner && d.managerNote !== undefined) data.managerNote = d.managerNote || null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "تغییری نفرستاده‌اید" }, { status: 400 });
  const card = await prisma.sessionCard.update({ where: { id }, data: data as never, include: CARD_INCLUDE });
  await createAuditLog({
    actorId: session.user.id,
    action: "SESSION_CARD_UPDATED",
    entityType: "SessionCard",
    entityId: id,
    oldValue: { status: existing.status } as never,
    newValue: { status: card.status } as never,
  });
  return NextResponse.json(serializeBigInt(card));
}
