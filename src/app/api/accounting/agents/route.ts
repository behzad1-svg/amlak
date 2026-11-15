import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { resolveSplit } from "@/lib/shares";

/**
 * گزارش حسابداری به تفکیک هر مشاور — فقط مدیر.
 * GET /api/accounting/agents
 * به‌ازای هر کاربر فعال: قراردادهای قطعی، حجم فروش قطعی، مجموع کمیسیون، پرداخت‌شده و پرداخت‌نشده.
 * جمع هر مشاور = مجموع مبلغ سهم‌های خودش است، نه مبلغ کامل معامله؛
 * سهم دفتر و سهم تعاون (بیرونی) جداگانه در totals می‌آیند.
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر به گزارش مشاوران دسترسی دارد" }, { status: 403 });
  }

  const [users, deals] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.deal.findMany({
      where: { status: { not: "CANCELED" } },
      select: {
        agentId: true,
        status: true,
        commissionToman: true,
        commissionPaid: true,
        dealSalePriceToman: true,
        officePct: true,
        agent: { select: { id: true, name: true } },
        shares: { select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true } },
      },
    }),
  ]);

  // سهم دفتر و تعاون روی همه معامله‌های دارای کمیسیون؛ جمع کل کمیسیون مبلغ کامل معامله می‌ماند
  let officeTotal = BigInt(0);
  let externalTotal = BigInt(0);
  let commissionGrandTotal = BigInt(0);
  for (const d of deals) {
    if (d.commissionToman == null) continue;
    commissionGrandTotal += d.commissionToman;
    const split = resolveSplit(d);
    officeTotal += split.officeAmount ?? BigInt(0);
    for (const s of split.shares) {
      if (s.isExternal) externalTotal += s.amount;
    }
  }

  const rows = users.map((u) => {
    let dealsCompleted = 0;
    let dealsWithCommission = 0;
    let saleVolume = BigInt(0);
    let commissionTotal = BigInt(0);
    let commissionPaid = BigInt(0);
    let commissionUnpaid = BigInt(0);
    for (const d of deals) {
      if (d.agentId !== u.id) continue;
      if (d.status === "COMPLETED") {
        dealsCompleted += 1;
        saleVolume += d.dealSalePriceToman ?? BigInt(0);
      }
      if (d.commissionToman != null) {
        dealsWithCommission += 1;
        // جمع مشاور فقط سهم‌های خودش است، نه مبلغ کامل معامله
        const mine = resolveSplit(d).shares.filter((s) => s.userId === u.id);
        for (const s of mine) {
          commissionTotal += s.amount;
          if (s.settled) commissionPaid += s.amount;
          else commissionUnpaid += s.amount;
        }
      }
    }
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      dealsCompleted,
      dealsWithCommission,
      saleVolume,
      commissionTotal,
      commissionPaid,
      commissionUnpaid,
    };
  });

  const totals = rows.reduce(
    (t, r) => ({
      dealsCompleted: t.dealsCompleted + r.dealsCompleted,
      dealsWithCommission: t.dealsWithCommission + r.dealsWithCommission,
      saleVolume: t.saleVolume + r.saleVolume,
      commissionTotal: t.commissionTotal + r.commissionTotal,
      commissionPaid: t.commissionPaid + r.commissionPaid,
      commissionUnpaid: t.commissionUnpaid + r.commissionUnpaid,
    }),
    { dealsCompleted: 0, dealsWithCommission: 0, saleVolume: BigInt(0), commissionTotal: BigInt(0), commissionPaid: BigInt(0), commissionUnpaid: BigInt(0) }
  );

  return NextResponse.json(serializeBigInt({ users: rows, totals: { ...totals, officeTotal, externalTotal, commissionGrandTotal } }));
}
