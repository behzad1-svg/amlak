import { prisma } from "./prisma";
import { MATCHING_CONFIG } from "./constants";

export interface MatchResult {
  id: string;
  score: number;
  reasons: string[];
  property?: unknown;
  customer?: unknown;
}

function budgetScore(customerMax: bigint | null, propertyPrice: bigint | null): number | null {
  if (customerMax == null || propertyPrice == null) return null;
  if (propertyPrice <= customerMax) return 100;
  const overPercent = Number((propertyPrice - customerMax) * BigInt(100) / customerMax);
  if (overPercent <= 10) return 70;
  return null; // رد
}

// برای RENT: ودیعه و اجاره را جداگانه امتیاز بده و میانگین بگیر
function rentBudgetScore(customerMax: bigint | null, deposit: bigint | null, monthlyRent: bigint | null): number | null {
  const dScore = budgetScore(customerMax, deposit);
  const rScore = budgetScore(customerMax, monthlyRent);
  if (dScore !== null && rScore !== null) return Math.round((dScore + rScore) / 2);
  if (dScore !== null) return dScore;
  if (rScore !== null) return rScore;
  return null;
}

function sizeScore(
  custMin: number | null, custMax: number | null, propSize: number | null
): number | null {
  if (propSize == null) return null;
  if (custMin == null && custMax == null) return null;
  const min = custMin ?? 0;
  const max = custMax ?? Infinity;
  if (propSize >= min && propSize <= max) return 100;
  // فاصله از بازه
  const center = custMin != null && custMax != null ? (custMin + custMax) / 2 : (custMin ?? custMax!);
  const range = custMax != null && custMin != null ? (custMax - custMin) : center * 0.3;
  if (range === 0) return propSize === center ? 100 : 50;
  const dist = Math.abs(propSize - center);
  const score = Math.max(0, 100 - (dist / range) * 50);
  return Math.round(score);
}

export async function findMatchesForCustomer(customerId: string): Promise<MatchResult[]> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.deletedAt) return [];

  const where: Record<string, unknown> = {
    deletedAt: null,
    status: "ACTIVE",
  };

  // Hard filters
  if (customer.preferredDealType) where.dealType = customer.preferredDealType;
  if (customer.preferredType) where.type = customer.preferredType;
  if (customer.preferredArea) where.region = customer.preferredArea;

  const properties = await prisma.property.findMany({ where });

  const results: MatchResult[] = [];
  for (const prop of properties) {
    let bScore: number | null = null;
    if (customer.preferredDealType === "RENT") {
      bScore = rentBudgetScore(customer.budgetMax, (prop as { depositToman: bigint | null }).depositToman, (prop as { monthlyRentToman: bigint | null }).monthlyRentToman);
    } else {
      bScore = budgetScore(customer.budgetMax, (prop as { salePriceToman: bigint | null }).salePriceToman);
    }

    // If budget exceeds 10% → رد
    if (customer.budgetMax != null && bScore === null) continue;

    const sScore = sizeScore(customer.preferredSizeMin, customer.preferredSizeMax, prop.sizeSqm);

    // محاسبه امتیاز نهایی
    let finalScore: number;
    const reasons: string[] = [];

    // Hard filter دلایل
    if (customer.preferredDealType) reasons.push(`نوع معامله ✓`);
    if (customer.preferredType) reasons.push(`نوع ملک ✓`);
    if (customer.preferredArea) reasons.push(`منطقه ✓`);

    if (bScore !== null && sScore !== null) {
      finalScore = Math.round(bScore * MATCHING_CONFIG.budgetWeight + sScore * MATCHING_CONFIG.sizeWeight);
      reasons.push(`بودجه ${bScore}%`);
      reasons.push(`متراژ ${sScore}%`);
    } else if (bScore !== null) {
      finalScore = bScore;
      reasons.push(`بودجه ${bScore}%`);
    } else if (sScore !== null) {
      finalScore = sScore;
      reasons.push(`متراژ ${sScore}%`);
    } else {
      // فقط hard filter رد شده — امتیاز پایه
      finalScore = 80;
      reasons.push("تطابق منطقه و نوع");
    }

    if (finalScore >= MATCHING_CONFIG.threshold) {
      results.push({ id: prop.id, score: finalScore, reasons, property: prop });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

export async function findMatchesForProperty(propertyId: string): Promise<MatchResult[]> {
  const property = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!property || property.deletedAt) return [];

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, stage: { not: "LOST" } },
  });

  const results: MatchResult[] = [];
  for (const cust of customers) {
    // Hard filters
    if (cust.preferredDealType && cust.preferredDealType !== (property as { dealType: string }).dealType) continue;
    if (cust.preferredType && cust.preferredType !== (property as { type: string }).type) continue;
    if (cust.preferredArea && cust.preferredArea !== (property as { region: string }).region) continue;

    let bScore: number | null = null;
    if (cust.preferredDealType === "RENT") {
      bScore = rentBudgetScore(cust.budgetMax, (property as { depositToman: bigint | null }).depositToman, (property as { monthlyRentToman: bigint | null }).monthlyRentToman);
    } else {
      bScore = budgetScore(cust.budgetMax, (property as { salePriceToman: bigint | null }).salePriceToman);
    }
    if (cust.budgetMax != null && bScore === null) continue;

    const sScore = sizeScore(cust.preferredSizeMin, cust.preferredSizeMax, property.sizeSqm);

    let finalScore: number;
    const reasons: string[] = [];
    if (cust.preferredDealType) reasons.push(`نوع معامله ✓`);
    if (cust.preferredType) reasons.push(`نوع ملک ✓`);
    if (cust.preferredArea) reasons.push(`منطقه ✓`);

    if (bScore !== null && sScore !== null) {
      finalScore = Math.round(bScore * MATCHING_CONFIG.budgetWeight + sScore * MATCHING_CONFIG.sizeWeight);
      reasons.push(`بودجه ${bScore}%`);
      reasons.push(`متراژ ${sScore}%`);
    } else if (bScore !== null) {
      finalScore = bScore;
      reasons.push(`بودجه ${bScore}%`);
    } else if (sScore !== null) {
      finalScore = sScore;
      reasons.push(`متراژ ${sScore}%`);
    } else {
      finalScore = 80;
      reasons.push("تطابق منطقه و نوع");
    }

    if (finalScore >= MATCHING_CONFIG.threshold) {
      results.push({ id: cust.id, score: finalScore, reasons, customer: cust });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

async function alreadyNotified(userId: string, relatedId: string, sourceId: string): Promise<boolean> {
  // جلوگیری از اعلان تکراری: اگر در 24 ساعت اخیر همان (user, relatedId) با همان sourceId وجود داشت، تکرار نکن
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      relatedId,
      type: "MATCH_SUGGESTION",
      createdAt: { gte: since },
      message: { contains: sourceId.slice(0, 8) },
    },
  });
  if (existing) return true;
  // همچنین چک دقیق پیام حاوی relatedId دیگر
  const exact = await prisma.notification.findFirst({
    where: { userId, relatedId, type: "MATCH_SUGGESTION", createdAt: { gte: since } },
  });
  // اگر هر تطبیق قبلی با همین جفت در 24 ساعت وجود داشت، آن را تکرار نکن — فقط اگر امتیاز تغییر کرده باشد اجازه می‌دهیم
  // برای سادگی: اگر هر رکوردی با همین relatedId در 24 ساعت بود، skip
  return !!exact;
}

export async function createMatchNotifications(
  matches: MatchResult[],
  sourceType: "customer" | "property",
  sourceId: string,
  sourceAgentId: string
) {
  for (const match of matches) {
    const targetId = match.id;
    let targetAgentId: string | null = null;

    if (sourceType === "customer") {
      const prop = match.property as { listedById: string; title: string } | undefined;
      if (prop) targetAgentId = prop.listedById;
    } else {
      const cust = match.customer as { assignedAgentId: string; name: string } | undefined;
      if (cust) targetAgentId = cust.assignedAgentId;
    }

    if (!targetAgentId) continue;

    // ضدتکرار
    const dedupKey = `${sourceType}:${sourceId}→${targetId}`;
    const alreadyForTarget = targetAgentId !== sourceAgentId ? await alreadyNotified(targetAgentId, sourceType === "customer" ? targetId : sourceId, sourceId) : false;
    const alreadyForSource = await alreadyNotified(sourceAgentId, targetId, sourceId);
    if (alreadyForTarget && alreadyForSource) continue;

    const score = match.score;
    const reasons = match.reasons.join(" — ");
    const priority = score >= 90 ? "HIGH" : score >= 80 ? "NORMAL" : "LOW";

    // Privacy: فقط نام مشاور، نه جزئیات شخصی
    const sourceLabel = sourceType === "customer" ? "مشتری" : "فایل";

    // نوتیفیکیشن برای مالک فایل/مشتری مقابل
    if (targetAgentId !== sourceAgentId && !alreadyForTarget) {
      await prisma.notification.create({
        data: {
          userId: targetAgentId,
          type: "MATCH_SUGGESTION",
          priority: priority as never,
          relatedType: sourceType === "customer" ? "Property" : "Customer",
          relatedId: sourceType === "customer" ? targetId : sourceId,
          message: `${score}% — ${reasons} — یه ${sourceLabel} جدید با فایل/مشتری شما تطبیق دارد، برای هماهنگی تماس بگیرید. [${dedupKey}]`,
        },
      });
    }

    // نوتیفیکیشن برای خود ایجادکننده هم
    if (!alreadyForSource) {
      await prisma.notification.create({
        data: {
          userId: sourceAgentId,
          type: "MATCH_SUGGESTION",
          priority: priority as never,
          relatedType: sourceType === "customer" ? "Property" : "Customer",
          relatedId: targetId,
          message: `${score}% — ${reasons} — تطبیق یافت. [${dedupKey}]`,
        },
      });
    }
  }
}

export async function runMatchingForCustomer(customerId: string, agentId: string) {
  if (process.env.MATCHING_ASYNC === "true") {
    // آینده: صف async
    return;
  }
  const matches = await findMatchesForCustomer(customerId);
  await createMatchNotifications(matches, "customer", customerId, agentId);
  return matches;
}

export async function runMatchingForProperty(propertyId: string, agentId: string) {
  if (process.env.MATCHING_ASYNC === "true") return;
  const matches = await findMatchesForProperty(propertyId);
  await createMatchNotifications(matches, "property", propertyId, agentId);
  return matches;
}
