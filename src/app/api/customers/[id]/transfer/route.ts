import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { customerTransferSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

/**
 * انتقال مشتری به مشاور دیگر — مدیر یا مشاوری که مشتری الان به او منتسب است.
 * PATCH /api/customers/[id]/transfer { toAgentId }
 * پیگیری‌ها، معامله‌ها و بازدیدها به مشتری وصل‌اند و با او منتقل می‌شوند.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: { assignedAgent: { select: { id: true, name: true } } },
  });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = customerTransferSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const toAgentId = parsed.data.toAgentId;
  if (toAgentId === customer.assignedAgentId) {
    return NextResponse.json({ error: "مشتری همین حالا به این مشاور منتسب است" }, { status: 400 });
  }
  const target = await prisma.user.findUnique({ where: { id: toAgentId } });
  if (!target) return NextResponse.json({ error: "مشاور مقصد یافت نشد" }, { status: 404 });
  if (!target.active) return NextResponse.json({ error: "مشاور مقصد فعال نیست" }, { status: 400 });

  const fromName = customer.assignedAgent?.name ?? "—";
  const updated = await prisma.customer.update({
    where: { id },
    data: { assignedAgentId: toAgentId },
    include: { assignedAgent: { select: { id: true, name: true } }, ownedProperties: true },
  });

  await prisma.activity.create({
    data: {
      type: "OTHER",
      agentId: session.user.id,
      customerId: id,
      description: `انتقال مشتری از ${fromName} به ${target.name}`,
      oldValue: fromName,
      newValue: target.name,
    },
  });

  await prisma.notification.create({
    data: {
      userId: toAgentId,
      type: "CUSTOMER_TRANSFERRED",
      priority: "NORMAL",
      relatedType: "Customer",
      relatedId: id,
      message: `مشتری «${customer.name}» از طرف ${fromName} به شما منتقل شد.`,
    },
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "CUSTOMER_TRANSFERRED",
    entityType: "Customer",
    entityId: id,
    oldValue: { assignedAgentId: customer.assignedAgentId, assignedAgentName: fromName } as never,
    newValue: { assignedAgentId: toAgentId, assignedAgentName: target.name } as never,
  });

  // تطبیق‌ها برای مشاور تازه اجرا شود تا اعلان‌های تطبیق به او برسد
  try {
    await runMatchingForCustomer(id, toAgentId);
  } catch (e) {
    console.error("[matching] runMatchingForCustomer failed for transfer", id, e instanceof Error ? e.message : e);
  }

  return NextResponse.json(serializeBigInt(updated));
}
