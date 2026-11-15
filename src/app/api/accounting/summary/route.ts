import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { resolveSplit } from "@/lib/shares";

/**
 * خلاصه حسابداری.
 * GET /api/accounting/summary
 * مدیر: همه معاملات و موجودی صندوق؛ مشاور: فقط کمیسیون‌های خودش، بدون صندوق.
 * کمیسیون همان مقداری است که در معامله ثبت شده؛ هیچ تعرفه یا فرمولی اینجا ساخته نمی‌شود.
 * «مجموع کمیسیون» مبلغ کامل معامله می‌ماند؛ «سهم دفتر» و «بدهی به مشاوران»
 * از روی سهم‌بندی حساب می‌شوند (معامله بدون سهم واقعی = ۱۰۰٪ برای مشاور معامله).
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";
  const agentFilter = isOwner ? {} : { agentId: session.user.id };

  // «معامله قطعی» روی همه معامله‌های غیرلغوشده شمرده می‌شود، نه فقط آن‌هایی که کمیسیون دارند؛
  // جمع‌های کمیسیون فقط از معامله‌های دارای کمیسیون می‌آیند.
  const deals = await prisma.deal.findMany({
    where: { ...agentFilter, status: { not: "CANCELED" } },
    select: {
      commissionToman: true,
      commissionPaid: true,
      status: true,
      agentId: true,
      officePct: true,
      agent: { select: { id: true, name: true } },
      shares: { select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true } },
    },
  });

  let commissionTotal = BigInt(0);
  let commissionPaid = BigInt(0);
  let commissionUnpaid = BigInt(0);
  let unpaidCount = 0;
  let dealsCompleted = 0;
  let dealsWithCommission = 0;
  // سهم دفتر فقط روی معامله‌های قطعی دارای کمیسیون؛ بدهی به مشاوران روی همه معامله‌های دارای کمیسیون
  let officeTotal = BigInt(0);
  let debtToAgents = BigInt(0);
  for (const d of deals) {
    if (d.status === "COMPLETED") dealsCompleted += 1;
    if (d.commissionToman == null) continue;
    dealsWithCommission += 1;
    const split = resolveSplit(d);
    if (isOwner) {
      const amount = d.commissionToman;
      commissionTotal += amount;
      if (d.commissionPaid) commissionPaid += amount;
      else {
        commissionUnpaid += amount;
        unpaidCount += 1;
      }
      if (d.status === "COMPLETED") officeTotal += split.officeAmount ?? BigInt(0);
      for (const s of split.shares) {
        if (!s.settled) debtToAgents += s.amount;
      }
    } else {
      // مشاور فقط سهم خودش را می‌بیند، نه مبلغ کامل معامله را
      const mine = split.shares.filter((s) => s.userId === session.user.id);
      let ownUnpaid = false;
      for (const s of mine) {
        commissionTotal += s.amount;
        if (s.settled) commissionPaid += s.amount;
        else {
          commissionUnpaid += s.amount;
          ownUnpaid = true;
        }
      }
      if (ownUnpaid) unpaidCount += 1;
    }
  }

  let cashboxBalance: bigint | null = null;
  let cashboxIn = BigInt(0);
  let cashboxOut = BigInt(0);
  if (isOwner) {
    const sums = await prisma.cashboxEntry.groupBy({
      by: ["type"],
      _sum: { amount: true },
    });
    for (const row of sums) {
      if (row.type === "IN") cashboxIn = row._sum.amount ?? BigInt(0);
      else cashboxOut = row._sum.amount ?? BigInt(0);
    }
    cashboxBalance = cashboxIn - cashboxOut;
  }

  return NextResponse.json(
    serializeBigInt({
      isOwner,
      cashboxBalance,
      cashboxIn,
      cashboxOut,
      commissionTotal,
      commissionPaid,
      commissionUnpaid,
      unpaidCount,
      dealsCompleted,
      dealsWithCommission,
      // فقط مدیر: سهم دفتر و بدهی به مشاوران
      officeTotal: isOwner ? officeTotal : null,
      debtToAgents: isOwner ? debtToAgents : null,
    })
  );
}
