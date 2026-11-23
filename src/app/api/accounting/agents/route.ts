import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { dealSplitPools, dealSplittable, resolveSplit } from "@/lib/shares";

/**
 * گزارش حسابداری به تفکیک هر مشاور — فقط مدیر.
 * GET /api/accounting/agents
 * به‌ازای هر کاربر فعال: قراردادهای قطعی، حجم فروش قطعی، مجموع کمیسیون، پرداخت‌شده و پرداخت‌نشده.
 * جمع هر مشاور = مجموع مبلغ سهم‌های خودش است، نه مبلغ کامل معامله؛
 * سهم دفتر و سهم تعاون (بیرونی) جداگانه در totals می‌آیند.
 * جمع کل کمیسیون = جمع ردیف‌های مشاورها + ردیف دفتر است؛ تعداد قرارداد
 * و حجم فروش جمع کل همان مقادیر متمایز معامله‌هاست تا معامله‌ها دو بار
 * حساب نشوند — ردیف دفتر همان معامله‌های مشاورها را پوشش می‌دهد.
 * تعاون بیرونی ردیفی در این جدول ندارد و در جمع کل نمی‌آید.
 * «قرارداد قطعی» معامله‌ای را می‌شمارد که مشاور صاحبش است یا در آن سهم
 * دارد (سهم واقعی یا سهم مجازی معامله بدون سهم)؛ حجم فروش فقط از
 * معامله‌های خودش است. جمع کل «قرارداد قطعی» تعداد معامله‌های یکتاست،
 * نه جمع ردیف‌ها — یک معامله می‌تواند برای چند مشاور شمرده شود.
 *
 * ردیف «دفتر» (فقط مدیر): دفتر خودش یک طرف حساب است — سهم دفتر همه
 * معامله‌های قطعی با همان resolveSplit حساب می‌شود (نه محاسبه جدا).
 * «پرداخت‌شده» سهم دفترِ معامله‌های «دریافت شد» خورده است و بقیه
 * «پرداخت‌نشده»؛ حجم فروش دفتر جمع قیمت معامله‌های مرتبط با دفتر است.
 * مشاور (AGENT) به این ای‌پی‌آی 403 می‌گیرد — ردیف دفتر و ردیف
 * مشاورهای دیگر به او نشت نمی‌کند (اسکوپ مشاور فقط در ‎/reports است).
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
      where: { status: "COMPLETED" },
      select: {
        agentId: true,
        status: true,
        commissionToman: true,
        sellerCommissionToman: true,
        buyerCommissionToman: true,
        sellerShiriniToman: true,
        buyerShiriniToman: true,
        discountToman: true,
        sellerDiscountToman: true,
        buyerDiscountToman: true,
        commissionPaid: true,
        dealSalePriceToman: true,
        officePct: true, // فقط ورودی resolveSplit است؛ هیچ جمعی از آن مستقیم خوانده نمی‌شود
        officeShiriniPct: true, // فقط ورودی resolveSplit است؛ هیچ جمعی از آن مستقیم خوانده نمی‌شود
        agent: { select: { id: true, name: true } },
        shares: { select: { id: true, userId: true, name: true, pct: true, shiriniPct: true, settled: true, settledAt: true } },
      },
    }),
  ]);

  // سهم‌بندی حل‌شدهٔ هر معامله را یک بار حساب کن — برای جمع دفتر/تعاون و جمع هر مشاور (فقط قطعی‌ها)
  const splits = deals.map((d) => resolveSplit(d));

  // سهم دفتر و تعاون روی معامله‌های قطعی دارای درآمد؛ جمع کل مبنای تقسیم (کمیسیون + هر دو شیرینی منهای تخفیف) می‌ماند
  let officeTotal = BigInt(0);
  let officeCommissionTotal = BigInt(0);
  let officeShiriniTotal = BigInt(0);
  let externalTotal = BigInt(0);
  let externalCommissionTotal = BigInt(0);
  let externalShiriniTotal = BigInt(0);
  let commissionGrandTotal = BigInt(0);
  let grandTotalCommission = BigInt(0);
  let grandTotalShirini = BigInt(0);
  deals.forEach((d, i) => {
    const base = dealSplittable(d);
    if (base <= BigInt(0)) return;
    commissionGrandTotal += base;
    const pools = dealSplitPools(d);
    grandTotalCommission += pools.commission;
    grandTotalShirini += pools.shirini;
    const split = splits[i];
    officeTotal += split.officeAmount ?? BigInt(0);
    officeCommissionTotal += split.officeCommissionAmount ?? BigInt(0);
    officeShiriniTotal += split.officeShiriniAmount ?? BigInt(0);
    for (const s of split.shares) {
      if (s.isExternal) {
        externalTotal += s.amount;
        externalCommissionTotal += s.commissionAmount;
        externalShiriniTotal += s.shiriniAmount;
      }
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
    let commissionPart = BigInt(0);
    let shiriniPart = BigInt(0);
    let commissionPaid = BigInt(0);
    let commissionUnpaid = BigInt(0);
    deals.forEach((d, i) => {
      // قرارداد قطعی: معامله‌ای که مشاور صاحبش است یا در آن سهم دارد؛
      // حجم فروش فقط از معامله‌های خودش است و با تعداد قرارداد جمع نمی‌شود
      const participates = d.agentId === u.id || splits[i].shares.some((s) => s.userId === u.id);
      if (participates && d.status === "COMPLETED") {
        dealsCompleted += 1;
      }
      if (d.agentId === u.id) {
        if (d.status === "COMPLETED") {
          saleVolume += d.dealSalePriceToman ?? BigInt(0);
        }
        if (d.commissionToman != null) dealsWithCommission += 1;
      }
      // جمع کمیسیون فقط سهم‌های خودش است — در همه معامله‌ها، نه فقط معامله‌های خودش؛
      // معامله تقسیم‌نشده سهم مجازیِ بقیهٔ درصد دفتر را برای مشاور معامله دارد
      if (dealSplittable(d) > BigInt(0)) {
        for (const s of splits[i].shares) {
          if (s.userId !== u.id) continue;
          commissionTotal += s.amount;
          commissionPart += s.commissionAmount;
          shiriniPart += s.shiriniAmount;
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
      commissionPart,
      shiriniPart,
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
      commissionPart: t.commissionPart + r.commissionPart,
      shiriniPart: t.shiriniPart + r.shiriniPart,
      commissionPaid: t.commissionPaid + r.commissionPaid,
      commissionUnpaid: t.commissionUnpaid + r.commissionUnpaid,
    }),
    { dealsCompleted: 0, dealsWithCommission: 0, saleVolume: BigInt(0), commissionTotal: BigInt(0), commissionPart: BigInt(0), shiriniPart: BigInt(0), commissionPaid: BigInt(0), commissionUnpaid: BigInt(0) }
  );

  // جمع «قرارداد قطعی» تعداد معامله‌های یکتاست، نه جمع ردیف‌ها — یک معامله
  // می‌تواند برای چند مشاور شمرده شود (صاحب + سهم‌داران)
  const completedDealsTotal = deals.filter((d) => d.status === "COMPLETED").length;

  // ردیف «دفتر» — با همان resolveSplit معامله‌ها، نه محاسبه جدا؛
  // totals بالا فقط جمع ردیف‌های مشاوران است، پس ردیف دفتر بعد از آن
  // ساخته می‌شود. commissionTotal ردیف دفتر همیشه با totals.officeTotal
  // برابر است — و جمع کل کمیسیون پایین‌تر سهم دفتر را هم می‌گیرد.
  const officeRow = (() => {
    let dealsCompleted = 0;
    let dealsWithCommission = 0;
    let saleVolume = BigInt(0);
    let commissionTotal = BigInt(0);
    let commissionPart = BigInt(0);
    let shiriniPart = BigInt(0);
    let commissionPaid = BigInt(0);
    let commissionUnpaid = BigInt(0);
    deals.forEach((d, i) => {
      const base = dealSplittable(d);
      if (base <= BigInt(0)) return;
      const officeAmount = splits[i].officeAmount ?? BigInt(0);
      if (officeAmount <= BigInt(0)) return;
      dealsCompleted += 1;
      if (d.commissionToman != null) dealsWithCommission += 1;
      saleVolume += d.dealSalePriceToman ?? BigInt(0);
      commissionTotal += officeAmount;
      commissionPart += splits[i].officeCommissionAmount ?? BigInt(0);
      shiriniPart += splits[i].officeShiriniAmount ?? BigInt(0);
      // سهم دفتر تسویه جداگانه ندارد؛ «دریافت شد» خوردن معامله یعنی سهم
      // دفترش وصول‌شده است و بقیه وصول‌نشده.
      if (d.commissionPaid) commissionPaid += officeAmount;
      else commissionUnpaid += officeAmount;
    });
    return {
      id: "office",
      name: "دفتر",
      role: "OFFICE",
      dealsCompleted,
      dealsWithCommission,
      saleVolume,
      commissionTotal,
      commissionPart,
      shiriniPart,
      commissionPaid,
      commissionUnpaid,
    };
  })();

  // جمع کل کمیسیون سهم دفتر را هم می‌گیرد (مشاورها + دفتر)؛ تعداد
  // قرارداد و حجم فروش همان مقادیر متمایز معامله‌ها می‌مانند تا معامله‌ها
  // دو بار حساب نشوند. تعاون بیرونی در جمع کل نمی‌آید.
  const totalsWithOffice = {
    ...totals,
    dealsCompleted: completedDealsTotal,
    commissionTotal: totals.commissionTotal + officeRow.commissionTotal,
    commissionPart: totals.commissionPart + officeRow.commissionPart,
    shiriniPart: totals.shiriniPart + officeRow.shiriniPart,
    commissionPaid: totals.commissionPaid + officeRow.commissionPaid,
    commissionUnpaid: totals.commissionUnpaid + officeRow.commissionUnpaid,
    officeTotal,
    officeCommissionTotal,
    officeShiriniTotal,
    externalTotal,
    externalCommissionTotal,
    externalShiriniTotal,
    commissionGrandTotal,
    grandTotalCommission,
    grandTotalShirini,
  };

  return NextResponse.json(serializeBigInt({ users: [...rows, officeRow], totals: totalsWithOffice }));
}
