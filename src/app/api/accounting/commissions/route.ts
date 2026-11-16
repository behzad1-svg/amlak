import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { resolveSplit, splitForViewer } from "@/lib/shares";

/**
 * فهرست کمیسیون‌ها — از روی معامله‌های ثبت‌شده.
 * GET /api/accounting/commissions?paid=all|paid|unpaid
 * مدیر: همه؛ مشاور: فقط معامله‌های خودش. لغوشده‌ها نمی‌آیند.
 * معامله‌های قطعیِ بدون کمیسیون و شیرینی هم می‌آیند (وضعیت «تعیین نشده»)؛
 * در فیلتر «پرداخت‌نشده» فقط معامله‌های دارای کمیسیونِ پرداخت‌نشده‌اند.
 * هر معامله سهم‌بندی‌اش را هم می‌آورد؛ مشاور فقط سهم خودش را می‌بیند
 * (سهم دفتر و سهم مشاورهای دیگر برایش پنهان است).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";

  const paid = new URL(req.url).searchParams.get("paid") ?? "all";
  const where: Record<string, unknown> = {
    status: { not: "CANCELED" },
  };
  if (!isOwner) where.agentId = session.user.id;
  if (paid === "paid") where.commissionPaid = true;
  else if (paid === "unpaid") {
    // معامله بدون درآمد «پرداخت‌نشده» نیست — فقط دارای کمیسیون یا شیرینی‌ها
    where.commissionPaid = false;
    where.OR = [
      { commissionToman: { not: null } },
      { sellerShiriniToman: { not: null } },
      { buyerShiriniToman: { not: null } },
    ];
  }

  const deals = await prisma.deal.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, dealType: true, region: true } },
      agent: { select: { id: true, name: true } },
      shares: {
        select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const out = deals.map((d) => {
    const split = splitForViewer(resolveSplit(d), isOwner ? null : session.user.id, isOwner);
    return {
      ...d,
      officePct: split.officePct,
      officeAmount: split.officeAmount,
      shares: split.shares,
    };
  });
  return NextResponse.json(serializeBigInt(out));
}
