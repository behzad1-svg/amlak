import { prisma } from "./prisma";
import { MATCHING_CONFIG } from "./constants";

export interface MatchResult {
  id: string;
  score: number;
  reasons: string[];
  property?: unknown;
  customer?: unknown;
}

function inRangeScore(value: number | bigint | null, min: number | bigint | null, max: number | bigint | null): number | null {
  if (value == null) return null;
  const v = Number(value);
  const lo = min == null ? 0 : Number(min);
  const hi = max == null ? Infinity : Number(max);
  if (v >= lo && v <= hi) return 100;
  const center = min != null && max != null ? (lo + hi) / 2 : (min != null ? lo : hi === Infinity ? v : hi);
  const range = min != null && max != null ? hi - lo : Math.max(center * 0.2, 1);
  if (!Number.isFinite(range) || range === 0) return v === center ? 100 : 40;
  const dist = Math.abs(v - center);
  return Math.round(Math.max(0, 100 - (dist / range) * 50));
}

function budgetScore(customerMax: bigint | null, propertyPrice: bigint | null, customerMin?: bigint | null): number | null {
  if (propertyPrice == null) return null;
  // کف بودجه: اگر ملک خیلی ارزان‌تر از حداقل باشد، امتیاز کمی کم می‌شود (نه رد)
  if (customerMin != null && propertyPrice < customerMin) {
    const under = Number(((customerMin - propertyPrice) * BigInt(100)) / customerMin);
    if (under > 40) return null;
    return Math.max(40, 80 - under);
  }
  if (customerMax == null) {
    // بدون سقف، فقط کف را چک کردیم
    return customerMin != null ? 90 : null;
  }
  if (propertyPrice <= customerMax) {
    // نزدیک سقف بهتر از خیلی پایین‌تر نیست ولی قابل قبول است
    const fill = Number((propertyPrice * BigInt(100)) / customerMax);
    return Math.min(100, 70 + Math.round(fill * 0.3));
  }
  const overPercent = Number(((propertyPrice - customerMax) * BigInt(100)) / customerMax);
  if (overPercent <= 10) return 70;
  return null;
}

/** امتیاز اجاره: مقایسه ودیعه و اجاره با سقف‌های جدا + معادل ماهانه بازار ایران */
function rentBudgetScore(
  customerMaxDeposit: bigint | null,
  customerMaxMonthly: bigint | null,
  deposit: bigint | null,
  monthlyRent: bigint | null,
  customerMinDeposit?: bigint | null
): number | null {
  const scores: number[] = [];

  if (deposit != null && customerMaxDeposit != null) {
    const s = budgetScore(customerMaxDeposit, deposit, customerMinDeposit ?? null);
    if (s === null && customerMaxMonthly == null) return null;
    if (s !== null) scores.push(s);
  } else if (deposit != null && customerMinDeposit != null && deposit < customerMinDeposit) {
    const under = Number(((customerMinDeposit - deposit) * BigInt(100)) / customerMinDeposit);
    if (under > 40) return null;
    scores.push(Math.max(40, 80 - under));
  }

  if (monthlyRent != null && customerMaxMonthly != null) {
    const s = inRangeScore(monthlyRent, null, customerMaxMonthly);
    if (s === null) return null;
    if (monthlyRent > customerMaxMonthly) {
      const over = Number(((monthlyRent - customerMaxMonthly) * BigInt(100)) / customerMaxMonthly);
      if (over > 10) return null;
      scores.push(70);
    } else {
      scores.push(s === null ? 100 : Math.max(70, s));
    }
  }

  // معادل ماهانه: اجاره + ودیعه/۳۰ — اگر فقط سقف ودیعه داریم
  if (deposit != null && monthlyRent != null && customerMaxDeposit != null && customerMaxMonthly == null) {
    const equivMonthly = monthlyRent + deposit / MATCHING_CONFIG.depositToMonthlyDivisor;
    const capFromDeposit = customerMaxDeposit / MATCHING_CONFIG.depositToMonthlyDivisor;
    const softCap = (capFromDeposit * BigInt(120)) / BigInt(100);
    if (equivMonthly > softCap && deposit > customerMaxDeposit) return null;
  }

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

function sizeScore(
  custMin: number | null, custMax: number | null, propSize: number | null
): number | null {
  if (propSize == null) return null;
  if (custMin == null && custMax == null) return null;
  return inRangeScore(propSize, custMin, custMax);
}

function bedsScore(custBeds: number | null, propBeds: number | null): number | null {
  if (custBeds == null || propBeds == null) return null;
  if (propBeds === custBeds) return 100;
  const diff = Math.abs(propBeds - custBeds);
  return Math.max(0, 100 - diff * 25);
}

function finalScore(parts: { budget: number | null; size: number | null; beds: number | null }): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const weights = [
    { key: "budget" as const, label: "بودجه", w: MATCHING_CONFIG.budgetWeight, v: parts.budget },
    { key: "size" as const, label: "متراژ", w: MATCHING_CONFIG.sizeWeight, v: parts.size },
    { key: "beds" as const, label: "خواب", w: MATCHING_CONFIG.bedsWeight, v: parts.beds },
  ].filter((x) => x.v !== null);

  if (weights.length === 0) {
    return { score: 80, reasons: ["تطابق منطقه و نوع"] };
  }

  const totalW = weights.reduce((s, x) => s + x.w, 0);
  const score = Math.round(weights.reduce((s, x) => s + (x.v as number) * x.w, 0) / totalW);
  for (const x of weights) reasons.push(`${x.label} ${x.v}%`);
  return { score, reasons };
}

type CustLike = {
  preferredDealType: string | null;
  preferredType: string | null;
  preferredArea: string | null;
  preferredAreas: string[] | null;
  preferredBeds: number | null;
  preferredSizeMin: number | null;
  preferredSizeMax: number | null;
  budgetMin: bigint | null;
  budgetMax: bigint | null;
  budgetMaxMonthly?: bigint | null;
};

type PropLike = {
  dealType: string;
  type: string;
  region: string;
  salePriceToman: bigint | null;
  depositToman: bigint | null;
  monthlyRentToman: bigint | null;
  sizeSqm: number | null;
  beds: number | null;
};

function effectiveAreas(cust: CustLike): string[] {
  const areas = (cust.preferredAreas ?? []) as string[];
  if (areas.length > 0) return areas;
  return cust.preferredArea ? [cust.preferredArea] : [];
}

function scorePair(cust: CustLike, prop: PropLike): { score: number; reasons: string[] } | null {
  if (cust.preferredDealType && cust.preferredDealType !== prop.dealType) return null;
  if (cust.preferredType && cust.preferredType !== prop.type) return null;
  const areas = effectiveAreas(cust);
  if (areas.length > 0 && !areas.includes(prop.region)) return null;

  const budgetMaxMonthly = (cust as { budgetMaxMonthly?: bigint | null }).budgetMaxMonthly ?? null;

  let bScore: number | null = null;
  if (prop.dealType === "RENT" || cust.preferredDealType === "RENT") {
    bScore = rentBudgetScore(cust.budgetMax, budgetMaxMonthly, prop.depositToman, prop.monthlyRentToman, cust.budgetMin);
  } else {
    bScore = budgetScore(cust.budgetMax, prop.salePriceToman, cust.budgetMin);
  }

  // سقف بودجه رد صریح
  if (cust.budgetMax != null || budgetMaxMonthly != null) {
    if (bScore === null) return null;
  }

  const sScore = sizeScore(cust.preferredSizeMin, cust.preferredSizeMax, prop.sizeSqm);
  const bedScore = bedsScore(cust.preferredBeds, prop.beds);

  const reasons: string[] = [];
  if (cust.preferredDealType) reasons.push("نوع معامله ✓");
  if (cust.preferredType) reasons.push("نوع ملک ✓");
  if (areas.length > 0) reasons.push("منطقه ✓");

  const { score, reasons: scoreReasons } = finalScore({ budget: bScore, size: sScore, beds: bedScore });
  reasons.push(...scoreReasons);
  return { score, reasons };
}

export async function findMatchesForCustomer(customerId: string): Promise<MatchResult[]> {
  // نقد ۷ — فقط فیلدهای لازم برای امتیازدهی خوانده می‌شود
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, deletedAt: true, preferredDealType: true, preferredType: true,
      preferredArea: true, preferredAreas: true, preferredBeds: true,
      preferredSizeMin: true, preferredSizeMax: true,
      budgetMin: true, budgetMax: true, budgetMaxMonthly: true,
    },
  });
  if (!customer || customer.deletedAt) return [];

  const where: Record<string, unknown> = {
    deletedAt: null,
    status: "ACTIVE",
  };

  const cust = customer as unknown as CustLike & { preferredDealType: string | null; preferredType: string | null };
  if (cust.preferredDealType) where.dealType = cust.preferredDealType;
  if (cust.preferredType) where.type = cust.preferredType;
  const areas = effectiveAreas(cust);
  if (areas.length > 0) where.region = { in: areas };

  const properties = await prisma.property.findMany({
    where,
    select: {
      id: true, listedById: true, title: true, dealType: true, type: true, region: true,
      salePriceToman: true, depositToman: true, monthlyRentToman: true, sizeSqm: true, beds: true,
    },
  });

  const results: MatchResult[] = [];
  for (const prop of properties) {
    const scored = scorePair(cust, prop as unknown as PropLike);
    if (!scored) continue;
    if (scored.score >= MATCHING_CONFIG.threshold) {
      results.push({ id: prop.id, score: scored.score, reasons: scored.reasons, property: prop });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function findMatchesForProperty(propertyId: string): Promise<MatchResult[]> {
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true, deletedAt: true, dealType: true, type: true, region: true,
      salePriceToman: true, depositToman: true, monthlyRentToman: true, sizeSqm: true, beds: true,
    },
  });
  if (!property || property.deletedAt) return [];

  const prop = property as unknown as PropLike;
  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, stage: { notIn: ["LOST", "FAILED", "WON"] } },
    select: {
      id: true, assignedAgentId: true, name: true, preferredDealType: true, preferredType: true,
      preferredArea: true, preferredAreas: true, preferredBeds: true,
      preferredSizeMin: true, preferredSizeMax: true,
      budgetMin: true, budgetMax: true, budgetMaxMonthly: true,
    },
  });

  const results: MatchResult[] = [];
  for (const cust of customers) {
    const scored = scorePair(cust as unknown as CustLike, prop);
    if (!scored) continue;
    if (scored.score >= MATCHING_CONFIG.threshold) {
      results.push({ id: cust.id, score: scored.score, reasons: scored.reasons, customer: cust });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function createMatchNotifications(
  matches: MatchResult[],
  sourceType: "customer" | "property",
  sourceId: string,
  sourceAgentId: string
) {
  // فقط تطبیق‌های قوی (امتیاز ۸۰ به بالا) اعلان می‌شوند؛ تطبیق‌های ضعیف
  // (۷۰ تا ۷۹) فقط در لیست تطبیق فایل/مشتری دیده می‌شوند، نه به‌عنوان اعلان.
  const strong = matches.filter((m) => m.score >= 80);
  if (strong.length === 0) return;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  // نام موجودیت تازه‌ساخته‌شده (منبع تطبیق) یک بار خوانده می‌شود تا متن
  // اعلان، نام مشتری و عنوان فایل را با هم داشته باشد.
  let sourceName: string | null = null;
  if (sourceType === "customer") {
    const src = await prisma.customer.findUnique({ where: { id: sourceId }, select: { name: true } });
    sourceName = src?.name ?? null;
  } else {
    const src = await prisma.property.findUnique({ where: { id: sourceId }, select: { title: true } });
    sourceName = src?.title ?? null;
  }

  // اعلان‌ها به‌ازای هر (کاربر، موجودیت تازه) گروه‌بندی می‌شوند: اگر یک فایل
  // تازه با پنج مشتری تطبیق بخورد، سازندهٔ فایل یک اعلان با هر پنج مورد
  // می‌گیرد، نه پنج اعلان جدا؛ و مشاور هر مشتری هم یک اعلان گروهی می‌گیرد.
  type Group = { userId: string; relatedType: string; relatedId: string; priority: string; kind: "target" | "source"; entries: { label: string; score: number; reasons: string }[] };
  const groups = new Map<string, Group>();
  const sourceRelatedType = sourceType === "customer" ? "Customer" : "Property";
  for (const match of strong) {
    const targetId = match.id;
    let targetAgentId: string | null = null;
    let custName: string | null = null;
    let propTitle: string | null = null;

    if (sourceType === "customer") {
      custName = sourceName;
      const prop = match.property as { listedById: string; title: string } | undefined;
      if (prop) {
        targetAgentId = prop.listedById;
        propTitle = prop.title;
      }
    } else {
      propTitle = sourceName;
      const cust = match.customer as { assignedAgentId: string; name: string } | undefined;
      if (cust) {
        targetAgentId = cust.assignedAgentId;
        custName = cust.name;
      }
    }

    if (!targetAgentId) continue;
    const score = match.score;
    const reasons = match.reasons.join("، ");
    const priority = score >= 90 ? "HIGH" : "NORMAL";
    // موجودیتِ طرف مقابل، از دید گیرندهٔ اعلان
    const otherLabel = sourceType === "customer"
      ? (propTitle ? `فایل «${propTitle}»` : "فایل")
      : (custName ? `مشتری ${custName}` : "مشتری");

    if (targetAgentId !== sourceAgentId) {
      const key = `${targetAgentId}:${sourceId}:target`;
      let g = groups.get(key);
      if (!g) {
        g = { userId: targetAgentId, relatedType: sourceRelatedType, relatedId: sourceId, priority, kind: "target", entries: [] };
        groups.set(key, g);
      }
      if (score >= 90) g.priority = "HIGH";
      g.entries.push({ label: otherLabel, score, reasons });
    }

    const skey = `${sourceAgentId}:${sourceId}:source`;
    let sg = groups.get(skey);
    if (!sg) {
      sg = { userId: sourceAgentId, relatedType: sourceRelatedType, relatedId: sourceId, priority, kind: "source", entries: [] };
      groups.set(skey, sg);
    }
    if (score >= 90) sg.priority = "HIGH";
    sg.entries.push({ label: otherLabel, score, reasons });
  }
  if (groups.size === 0) return;

  const sourceLabel = sourceType === "customer"
    ? (sourceName ? `مشتری ${sourceName}` : "مشتری")
    : (sourceName ? `فایل «${sourceName}»` : "فایل");
  const rows: { userId: string; type: string; relatedId: string; relatedType: string; priority: string; message: string }[] = [];
  for (const g of groups.values()) {
    const sorted = [...g.entries].sort((a, b) => b.score - a.score);
    const shown = sorted.slice(0, 3).map((e) => `${e.label} (${e.score}٪ — ${e.reasons})`).join("، ");
    const rest = sorted.length > 3 ? ` و ${sorted.length - 3} مورد دیگر` : "";
    const message = g.kind === "target"
      ? `برای ${sourceLabel} ${sorted.length} تطبیق تازه: ${shown}${rest} — برای هماهنگی تماس بگیرید.`
      : `برای ${sourceLabel} ${sorted.length} تطبیق تازه یافت شد: ${shown}${rest}.`;
    rows.push({ userId: g.userId, type: "MATCH_SUGGESTION", priority: g.priority, relatedType: g.relatedType, relatedId: g.relatedId, message });
  }

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const relatedIds = [...new Set(rows.map((r) => r.relatedId))];
  const existing = await prisma.notification.findMany({
    where: { userId: { in: userIds }, relatedId: { in: relatedIds }, type: "MATCH_SUGGESTION", createdAt: { gte: since } },
    select: { userId: true, relatedId: true },
  });
  const seen = new Set(existing.map((n) => `${n.userId}:${n.relatedId}`));
  const fresh = rows.filter((r) => !seen.has(`${r.userId}:${r.relatedId}`));
  if (fresh.length === 0) return;
  await prisma.notification.createMany({
    data: fresh.map((r) => ({
      userId: r.userId,
      type: "MATCH_SUGGESTION" as never,
      priority: r.priority as never,
      relatedType: r.relatedType,
      relatedId: r.relatedId,
      message: r.message,
    })),
  });
}

export async function runMatchingForCustomer(customerId: string, agentId: string) {
  // نقد ۷ — تطبیق همگام در مسیر درخواست اجرا می‌شود (بعد از دسته‌ای‌شدن
  // اعلان‌ها و select حداقلی، سریع است). پرچم جعلی MATCHING_ASYNC حذف شد؛
  // صف واقعی (جدول + scheduled function) قدم بعدی است، نه این تغییر.
  const matches = await findMatchesForCustomer(customerId);
  await createMatchNotifications(matches, "customer", customerId, agentId);
  return matches;
}

export async function runMatchingForProperty(propertyId: string, agentId: string) {
  const matches = await findMatchesForProperty(propertyId);
  await createMatchNotifications(matches, "property", propertyId, agentId);
  return matches;
}
