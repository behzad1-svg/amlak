import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { commissionSettleSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { dealSplittable, resolveSplit } from "@/lib/shares";

/**
 * تسویه یا برگرداندن تسویه کمیسیون یک معامله — فقط مدیر.
 * PATCH /api/accounting/commissions/[id] { commissionPaid: boolean }
 * دکمه «تسویه شد» همه سهم‌های معامله را تسویه می‌کند و «برگرداندن» همه را برمی‌گرداند؛
 * معامله بدون سهم واقعی همان رفتار قبلی را دارد.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند کمیسیون را تسویه کند" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = commissionSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({ where: { id }, include: { shares: true } });
  if (!deal) return NextResponse.json({ error: "معامله یافت نشد" }, { status: 404 });
  const dealIncome = dealSplittable(deal);
  if (dealIncome <= BigInt(0)) {
    return NextResponse.json({ error: "برای این معامله کمیسیون یا شیرینی ثبت نشده است" }, { status: 400 });
  }

  const paid = parsed.data.commissionPaid;
  const updated = await prisma.$transaction(async (tx) => {
    if (deal.shares.length > 0) {
      await tx.dealShare.updateMany({
        where: { dealId: id },
        data: { settled: paid, settledAt: paid ? new Date() : null },
      });
    }
    return tx.deal.update({
      where: { id },
      data: {
        commissionPaid: paid,
        commissionPaidAt: paid ? new Date() : null,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, title: true, dealType: true, region: true } },
        agent: { select: { id: true, name: true } },
        shares: {
          select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  const split = resolveSplit(updated);
  const out = {
    ...updated,
    officePct: split.officePct,
    officeAmount: split.officeAmount,
    shares: split.shares,
  };

  await createAuditLog({
    actorId: session.user.id,
    action: paid ? "COMMISSION_SETTLED" : "COMMISSION_UNSETTLED",
    entityType: "Deal",
    entityId: id,
    newValue: { commissionPaid: paid } as never,
  });

  return NextResponse.json(serializeBigInt(out));
}
