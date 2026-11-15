import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { shareSettleSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { syncDealCommissionPaid } from "@/lib/shares";

/**
 * تسویه یا برگرداندن تسویه یک سهم — فقط مدیر.
 * PATCH /api/accounting/shares/[id] { settled: boolean }
 * بعد از هر تغییر، پرچم تسویه کلی معامله از روی سهم‌ها همگام می‌شود:
 * همه سهم‌ها تسویه شده‌اند یعنی معامله تسویه شده است.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند سهم را تسویه کند" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = shareSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const share = await prisma.dealShare.findUnique({
    where: { id },
    include: { deal: { select: { id: true, commissionToman: true, commissionPaid: true } } },
  });
  if (!share) return NextResponse.json({ error: "سهم یافت نشد" }, { status: 404 });
  if (share.deal.commissionToman == null) {
    return NextResponse.json({ error: "برای این معامله کمیسیونی ثبت نشده است" }, { status: 400 });
  }

  const settled = parsed.data.settled;
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.dealShare.update({
      where: { id },
      data: { settled, settledAt: settled ? new Date() : null },
    });
    await syncDealCommissionPaid(tx, share.dealId);
    const deal = await tx.deal.findUnique({ where: { id: share.dealId }, select: { commissionPaid: true } });
    return { share: s, dealCommissionPaid: deal?.commissionPaid ?? false };
  });

  await createAuditLog({
    actorId: session.user.id,
    action: settled ? "SHARE_SETTLED" : "SHARE_UNSETTLED",
    entityType: "DealShare",
    entityId: id,
    newValue: { settled, dealId: share.dealId } as never,
  });

  return NextResponse.json(serializeBigInt(updated));
}
