import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { dealSplittable, resolveSplit } from "@/lib/shares";

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
        sellerShiriniToman: true,
        buyerShiriniToman: true,
        commissionPaid: true,
        dealSalePriceToman: true,
        officePct: true,
        agent: { select: { id: true, name: true } },
        shares: { select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true } },
      },
    }),
  ]);

  // سهم‌بندی حل‌شدهٔ هر معامله را یک بار حساب کن — برای جمع دفتر/تعاون و جمع هر مشاور
  const splits = deals.map((d) => resolveSplit(d));

  // سهم دفتر و تعاون روی همه معامله‌های دارای درآمد؛ جمع کل مبنای تقسیم (کمیسیون + هر دو شیرینی) می‌ماند
  let officeTotal = BigInt(0);
  let externalTotal = BigInt(0);
  let commissionGrandTotal = BigInt(0);
  deals.forEach((d, i) => {
    const base = dealSplittable(d);
    if (base <= BigInt(0)) return;
    commissionGrandTotal += base;
    const split = splits[i];
    officeTotal += split.officeAmount ?? BigInt(0);
    for (const s of split.shares) {
      if (s.isExternal) externalTotal += s.amount;
    }
  });

  // ردیف برای اجتماعِ صاحبان معامله و دارندگان سهم و همه کاربران فعال؛
  // مشاوری که فقط سهم دارد ولی صاحب معامله نیست هم ردیف خودش را می‌گیرد.
  const knownIds = new Set(users.map((u) => u.id));
  const extraIds = new Set<string>();
  deals.forEach((d, i) => {
    if (!knownIds.has(d.agentId)) extraIds.add(d.agentId);
    for (const s of splits[i].shares) {
      if (s.userId && !knownIds.has(s.userId)) extraIds.add(s.userId);
    }
  });
  const extraUsers =
    extraIds.size > 0
      ? await prisma.user.findMany({
          where: { id: { in: [...extraIds] } },
          select: { id: true, name: true, role: true },
        })
      : [];
  const allUsers = [...users, ...extraUsers].sort((a, b) => a.name.localeCompare(b.name, "fa"));

  const rows = allUsers.map((u) => {
    let dealsCompleted = 0;
    let dealsWithCommission = 0;
    let saleVolume = BigInt(0);
    let commissionTotal = BigInt(0);
    let commissionPaid = BigInt(0);
    let commissionUnpaid = BigInt(0);
    deals.forEach((d, i) => {
      // تعداد قرارداد و حجم فروش فقط از معامله‌هایی که صاحبشان است
      if (d.agentId === u.id) {
        if (d.status === "COMPLETED") {
          dealsCompleted += 1;
          saleVolume += d.dealSalePriceToman ?? BigInt(0);
        }
        if (d.commissionToman != null) dealsWithCommission += 1;
      }
      // جمع کمیسیون فقط سهم‌های خودش است — در همه معامله‌ها، نه فقط معامله‌های خودش؛
      // معامله تقسیم‌نشده همان سهم مجازی ۱۰۰٪ برای مشاور معامله را می‌دهد
      if (dealSplittable(d) > BigInt(0)) {
        for (const s of splits[i].shares) {
          if (s.userId !== u.id) continue;
          commissionTotal += s.amount;
          if (s.settled) commissionPaid += s.amount;
          else commissionUnpaid += s.amount;
        }
      }
    });
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
