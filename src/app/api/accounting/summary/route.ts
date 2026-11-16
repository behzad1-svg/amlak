import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { dealSplittable, dealTaxBase, resolveSplit } from "@/lib/shares";
import { getTaxRatePct } from "@/lib/settings";

/**
 * خلاصه حسابداری.
 * GET /api/accounting/summary
 * مدیر: همه معاملات و موجودی صندوق؛ مشاور: فقط کمیسیون‌های خودش، بدون صندوق.
 * کمیسیون همان مقداری است که در معامله ثبت شده؛ هیچ تعرفه یا فرمولی اینجا ساخته نمی‌شود.
 * «مجموع کمیسیون» مبلغ کامل معامله می‌ماند؛ «سهم دفتر» و «بدهی به مشاوران»
 * از روی سهم‌بندی حساب می‌شوند (معامله بدون سهم واقعی = ۱۰۰٪ برای مشاور معامله).
 * مبنای سهم‌بندی کمیسیون + شیرینی فروشنده + شیرینی خریدار است؛ «مجموع شیرینی»
 * فقط برای مدیر حساب می‌شود (مشاور سهم خودش از شیرینی را داخل سهمش می‌بیند).
 * مالیات ارزش افزوده فقط روی کمیسیون حساب می‌شود (شیرینی مالیات ندارد) و هرگز
 * وارد تقسیم نمی‌شود؛ «مجموع مالیات» فقط برای مدیر است و پول جداگانه اداره مالیات است.
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";
  const agentFilter = isOwner ? {} : { agentId: session.user.id };
  const taxRatePct = await getTaxRatePct();

  // «معامله قطعی» روی همه معامله‌های غیرلغوشده شمرده می‌شود، نه فقط آن‌هایی که کمیسیون دارند؛
  // جمع‌های کمیسیون فقط از معامله‌های دارای کمیسیون می‌آیند؛ «مجموع شیرینی» جمع هر دو شیرینی است.
  const deals = await prisma.deal.findMany({
    where: { ...agentFilter, status: { not: "CANCELED" } },
    select: {
      commissionToman: true,
      sellerShiriniToman: true,
      buyerShiriniToman: true,
      discountToman: true,
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
  let shiriniTotal = BigInt(0);
  let taxTotal = BigInt(0);
  let unpaidCount = 0;
  let dealsCompleted = 0;
  let dealsWithCommission = 0;
  // سهم دفتر فقط روی معامله‌های قطعی دارای درآمد؛ بدهی به مشاوران روی همه معامله‌های دارای درآمد
  let officeTotal = BigInt(0);
  let debtToAgents = BigInt(0);
  for (const d of deals) {
    if (d.status === "COMPLETED") dealsCompleted += 1;
    if (d.commissionToman != null) dealsWithCommission += 1;
    if (isOwner) {
      shiriniTotal += (d.sellerShiriniToman ?? BigInt(0)) + (d.buyerShiriniToman ?? BigInt(0));
    }
    // مالیات فقط روی کمیسیون است (شیرینی مالیات ندارد)؛ حتی معامله‌ای که کامل
    // تخفیف خورده و مبنای خالصش صفر است، روی کمیسیون ناخالص مالیات دارد
    if (isOwner) taxTotal += BigInt(Math.round((Number(dealTaxBase(d)) * taxRatePct) / 100));
    // معامله بدون درآمد قابل‌تقسیم (کمیسیون + شیرینی‌ها منهای تخفیف) سهم‌بندی ندارد
    const base = dealSplittable(d);
    if (base <= BigInt(0)) continue;
    const split = resolveSplit(d);
    if (isOwner) {
      const amount = d.commissionToman ?? BigInt(0);
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
      // فقط مدیر: مجموع شیرینی فروشنده و خریدار روی معامله‌های لغونشده
      shiriniTotal: isOwner ? shiriniTotal : null,
      // نرخ مالیات ارزش افزوده (٪) و مجموع مالیات روی معامله‌های لغونشده دارای درآمد؛ فقط مدیر
      taxRatePct,
      taxTotal: isOwner ? taxTotal : null,
      unpaidCount,
      dealsCompleted,
      dealsWithCommission,
      // فقط مدیر: سهم دفتر و بدهی به مشاوران
      officeTotal: isOwner ? officeTotal : null,
      debtToAgents: isOwner ? debtToAgents : null,
    })
  );
}
