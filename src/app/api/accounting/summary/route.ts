import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

/**
 * خلاصه حسابداری.
 * GET /api/accounting/summary
 * مدیر: همه معاملات و موجودی صندوق؛ مشاور: فقط کمیسیون‌های خودش، بدون صندوق.
 * کمیسیون همان مقداری است که در معامله ثبت شده؛ هیچ تعرفه یا فرمولی اینجا ساخته نمی‌شود.
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";
  const agentFilter = isOwner ? {} : { agentId: session.user.id };

  const deals = await prisma.deal.findMany({
    where: { ...agentFilter, status: { not: "CANCELED" }, commissionToman: { not: null } },
    select: { commissionToman: true, commissionPaid: true, status: true },
  });

  let commissionTotal = BigInt(0);
  let commissionPaid = BigInt(0);
  let commissionUnpaid = BigInt(0);
  let unpaidCount = 0;
  let dealsCompleted = 0;
  for (const d of deals) {
    const amount = d.commissionToman ?? BigInt(0);
    commissionTotal += amount;
    if (d.commissionPaid) commissionPaid += amount;
    else {
      commissionUnpaid += amount;
      unpaidCount += 1;
    }
    if (d.status === "COMPLETED") dealsCompleted += 1;
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
      dealsWithCommission: deals.length,
    })
  );
}
