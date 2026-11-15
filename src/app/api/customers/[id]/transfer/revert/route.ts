import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

/**
 * بازگرداندن مشتری به مشاور قبلی — یک قدم به عقب در زنجیره انتقال.
 * POST /api/customers/[id]/transfer/revert
 * فقط مدیر یا مشاوری که مشتری الان به او منتسب است. مشاور قبلی باید فعال باشد؛
 * بازگرداندن خودش یک انتقال تازه است (ردیف CustomerTransfer تازه + Activity + اعلان + audit).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const latest = await prisma.customerTransfer.findFirst({
    where: { customerId: id },
    orderBy: { createdAt: "desc" },
    include: { fromAgent: { select: { id: true, name: true, active: true } } },
  });
  if (!latest || !latest.fromAgentId) {
    return NextResponse.json({ error: "سابقه انتقالی برای بازگرداندن نیست" }, { status: 400 });
  }
  if (latest.toAgentId !== customer.assignedAgentId) {
    return NextResponse.json({ error: "سابقه انتقال با مشاور فعلی همخوانی ندارد" }, { status: 400 });
  }
  const prev = latest.fromAgent;
  if (!prev) {
    return NextResponse.json({ error: "مشاور قبلی یافت نشد" }, { status: 400 });
  }
  if (!prev.active) {
    return NextResponse.json({ error: "مشاور قبلی فعال نیست؛ از انتقال عادی استفاده کنید" }, { status: 400 });
  }
  if (prev.id === customer.assignedAgentId) {
    return NextResponse.json({ error: "مشتری همین حالا به این مشاور منتسب است" }, { status: 400 });
  }

  const fromName = customer.assignedAgent?.name ?? "—";
  const updated = await prisma.customer.update({
    where: { id },
    data: { assignedAgentId: prev.id },
    include: { assignedAgent: { select: { id: true, name: true } }, ownedProperties: true },
  });

  await prisma.customerTransfer.create({
    data: {
      customerId: id,
      fromAgentId: customer.assignedAgentId,
      toAgentId: prev.id,
      byUserId: session.user.id,
    },
  });

  await prisma.activity.create({
    data: {
      type: "OTHER",
      agentId: session.user.id,
      customerId: id,
      description: `بازگردانی مشتری از ${fromName} به ${prev.name}`,
      oldValue: fromName,
      newValue: prev.name,
    },
  });

  await prisma.notification.create({
    data: {
      userId: prev.id,
      type: "CUSTOMER_TRANSFERRED",
      priority: "NORMAL",
      relatedType: "Customer",
      relatedId: id,
      message: `مشتری «${customer.name}» از طرف ${fromName} به شما برگردانده شد.`,
    },
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "CUSTOMER_TRANSFERRED",
    entityType: "Customer",
    entityId: id,
    oldValue: { assignedAgentId: customer.assignedAgentId, assignedAgentName: fromName } as never,
    newValue: { assignedAgentId: prev.id, assignedAgentName: prev.name } as never,
  });

  // تطبیق‌ها برای مشاور قبلی اجرا شود تا اعلان‌های تطبیق به او برسد
  try {
    await runMatchingForCustomer(id, prev.id);
  } catch (e) {
    console.error("[matching] runMatchingForCustomer failed for revert", id, e instanceof Error ? e.message : e);
  }

  return NextResponse.json(serializeBigInt(updated));
}
