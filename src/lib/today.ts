// نمای «امروز» — صفحهٔ صبحگاهی مشاور: بازدیدها و کارت‌های جلسهٔ امروز،
// پیگیری‌های عقب‌افتاده، لیدهای بی‌جواب، فایل‌های بدون بازدید در ۳۰ روز،
// و بازدیدهای انجام‌شده که هنوز گزارش ندارند.
// همهٔ کوئری‌ها موازی و با سقف لیست؛ تعداد واقعی جداگانه برگردانده می‌شود
// تا شمارنده‌ها صادقانه بمانند (الگوی lib/dashboard.ts).
import { prisma } from "@/lib/prisma";

const LIST_LIMIT = 20;
const STALE_PROPERTY_DAYS = 30;
const UNANSWERED_LEAD_DAYS = 3;
const UNANSWERED_LEAD_FETCH = 200;
const STALE_PROPERTY_FETCH = 500;

/** تهران UTC+3:30 است و از ۲۰۲۲ ساعت تابستانی ندارد — آفست ثابت امن است. */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** بازهٔ «امروز» به وقت تهران: از ۰۰:۰۰ تا ۲۳:۵۹:۵۹٫۹۹۹ */
export function tehranDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + TEHRAN_OFFSET_MS);
  const startShifted = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
  const start = new Date(startShifted.getTime() - TEHRAN_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

export type TodaySection<T> = { total: number; items: T[] };

export type TodayViewing = {
  id: string;
  startAt: Date;
  status: string;
  customerId: string;
  customerName: string;
  propertyId: string;
  propertyTitle: string;
};

export type TodaySessionCard = {
  id: string;
  scheduledAt: Date;
  status: string;
  customerId: string;
  customerName: string;
  propertyId: string | null;
  propertyTitle: string | null;
  advisorName: string;
};

export type TodayFollowUp = {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  dueAt: Date;
  note: string | null;
  source: "followUp" | "nextFollowUp";
};

export type TodayLead = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  createdAt: Date;
  lastActivityAt: Date | null;
  daysSilent: number | null;
};

export type TodayStaleProperty = {
  id: string;
  code: string | null;
  title: string;
  region: string;
  lastViewedAt: Date | null;
};

export type TodayUnreportedViewing = {
  id: string;
  startAt: Date;
  customerId: string;
  customerName: string;
  propertyId: string;
  propertyTitle: string;
  agentName: string;
};

export type TodayData = {
  viewingsToday: TodaySection<TodayViewing>;
  sessionCardsToday: TodaySection<TodaySessionCard>;
  overdueFollowUps: TodaySection<TodayFollowUp>;
  unansweredLeads: TodaySection<TodayLead>;
  staleProperties: TodaySection<TodayStaleProperty>;
  visitsAwaitingReport: TodaySection<TodayUnreportedViewing>;
};

/**
 * دادهٔ نمای «امروز».
 * - مشاور فقط موردهای خودش را می‌بیند (agentId = خودش).
 * - مدیر همه را می‌بیند و با agentId می‌تواند یک مشاور را فیلتر کند.
 */
export async function getTodayData(
  userId: string,
  isOwner: boolean,
  agentId?: string | null,
  now: Date = new Date()
): Promise<TodayData> {
  const scopeAgent = isOwner ? agentId ?? null : userId;
  const { start: dayStart, end: dayEnd } = tehranDayBounds(now);
  const monthAgo = new Date(now.getTime() - STALE_PROPERTY_DAYS * 24 * 60 * 60 * 1000);

  const viewingsWhere: Record<string, unknown> = {
    startAt: { gte: dayStart, lte: dayEnd },
  };
  if (scopeAgent) viewingsWhere.agentId = scopeAgent;

  const sessionWhere: Record<string, unknown> = {
    scheduledAt: { gte: dayStart, lte: dayEnd },
    status: { in: ["PENDING", "CONFIRMED"] },
  };
  if (scopeAgent) {
    sessionWhere.OR = [
      { advisorId: scopeAgent },
      { coAdvisors: { some: { userId: scopeAgent } } },
    ];
  }

  const followUpWhere: Record<string, unknown> = {
    done: false,
    dueAt: { lt: now },
    customer: { deletedAt: null },
  };
  if (scopeAgent) (followUpWhere.customer as Record<string, unknown>).assignedAgentId = scopeAgent;

  const overdueCustomerWhere: Record<string, unknown> = {
    deletedAt: null,
    stage: { not: "LOST" },
    nextFollowUpAt: { lt: now },
  };
  if (scopeAgent) overdueCustomerWhere.assignedAgentId = scopeAgent;

  const leadWhere: Record<string, unknown> = {
    deletedAt: null,
    stage: { in: ["NEW", "INITIAL_CONTACT"] },
  };
  if (scopeAgent) leadWhere.assignedAgentId = scopeAgent;

  const propertyWhere: Record<string, unknown> = {
    deletedAt: null,
    status: "ACTIVE",
  };
  if (scopeAgent) propertyWhere.listedById = scopeAgent;

  const unreportedWhere: Record<string, unknown> = {
    status: "DONE",
    rating: null,
  };
  if (scopeAgent) unreportedWhere.agentId = scopeAgent;

  const [
    viewingsToday,
    viewingsTodayTotal,
    sessionCardsToday,
    sessionCardsTodayTotal,
    overdueFollowUps,
    overdueFollowUpsTotal,
    overdueCustomers,
    leadCandidates,
    propertyIds,
    viewedPropertyIds,
    unreported,
    unreportedTotal,
  ] = await Promise.all([
    prisma.viewing.findMany({
      where: viewingsWhere,
      select: {
        id: true,
        startAt: true,
        status: true,
        customer: { select: { id: true, name: true } },
        property: { select: { id: true, title: true } },
      },
      orderBy: { startAt: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.viewing.count({ where: viewingsWhere }),
    prisma.sessionCard.findMany({
      where: sessionWhere,
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        customer: { select: { id: true, name: true } },
        property: { select: { id: true, title: true } },
        advisor: { select: { name: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.sessionCard.count({ where: sessionWhere }),
    prisma.followUp.findMany({
      where: followUpWhere,
      select: {
        id: true,
        dueAt: true,
        note: true,
        customer: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { dueAt: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.followUp.count({ where: followUpWhere }),
    prisma.customer.findMany({
      where: overdueCustomerWhere,
      select: { id: true, name: true, phone: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: "asc" },
      take: LIST_LIMIT,
    }),
    prisma.customer.findMany({
      where: leadWhere,
      select: { id: true, name: true, phone: true, stage: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: UNANSWERED_LEAD_FETCH,
    }),
    prisma.property.findMany({
      where: propertyWhere,
      select: { id: true },
      take: STALE_PROPERTY_FETCH,
    }),
    prisma.viewing.findMany({
      where: { startAt: { gte: monthAgo } },
      select: { propertyId: true },
      distinct: ["propertyId"],
    }),
    prisma.viewing.findMany({
      where: unreportedWhere,
      select: {
        id: true,
        startAt: true,
        customer: { select: { id: true, name: true } },
        property: { select: { id: true, title: true } },
        agent: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
      take: LIST_LIMIT,
    }),
    prisma.viewing.count({ where: unreportedWhere }),
  ]);

  // پیگیری‌های عقب‌افتاده: ردیف‌های FollowUp + مشتری‌هایی که nextFollowUpAtشان
  // گذشته و ردیف پیگیری باز ندارند — هر مشتری یک بار، قدیمی‌ترین سررسید اول.
  const coveredCustomerIds = new Set(overdueFollowUps.map((f) => f.customer.id));
  const mergedFollowUps: TodayFollowUp[] = overdueFollowUps.map((f) => ({
    id: f.id,
    customerId: f.customer.id,
    customerName: f.customer.name,
    customerPhone: f.customer.phone,
    dueAt: f.dueAt,
    note: f.note,
    source: "followUp" as const,
  }));
  for (const c of overdueCustomers) {
    if (coveredCustomerIds.has(c.id) || !c.nextFollowUpAt) continue;
    mergedFollowUps.push({
      id: `cust-${c.id}`,
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      dueAt: c.nextFollowUpAt,
      note: null,
      source: "nextFollowUp" as const,
    });
  }
  mergedFollowUps.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  // لیدهای بی‌جواب: مرحله تماس اولیه و بیش از ۳ روز بدون هیچ فعالیتی
  // (سقف مرحله INITIAL_CONTACT در STALE_DAY_LIMITS هم ۳ روز است).
  const leadIds = leadCandidates.map((c) => c.id);
  const lastActivity = leadIds.length
    ? await prisma.activity.groupBy({
        by: ["customerId"],
        where: { customerId: { in: leadIds } },
        _max: { createdAt: true },
      })
    : [];
  const lastActivityMap = new Map(
    lastActivity.map((r) => [r.customerId as string, r._max.createdAt as Date | null])
  );
  const silentCutoff = now.getTime() - UNANSWERED_LEAD_DAYS * 24 * 60 * 60 * 1000;
  const unansweredLeads: TodayLead[] = leadCandidates
    .map((c) => {
      const last = lastActivityMap.get(c.id) ?? null;
      const daysSilent =
        last === null
          ? Math.floor((now.getTime() - c.createdAt.getTime()) / 86_400_000)
          : Math.floor((now.getTime() - last.getTime()) / 86_400_000);
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        stage: c.stage,
        createdAt: c.createdAt,
        lastActivityAt: last,
        daysSilent,
      };
    })
    .filter((l) => l.lastActivityAt === null || l.lastActivityAt.getTime() < silentCutoff);

  // فایل‌های بدون بازدید در ۳۰ روز: همه فایل‌های فعال منهای آن‌هایی که بازدید داشته‌اند
  const viewedSet = new Set(viewedPropertyIds.map((v) => v.propertyId));
  const staleIds = propertyIds.map((p) => p.id).filter((id) => !viewedSet.has(id));
  const staleDetails =
    staleIds.length > 0
      ? await prisma.property.findMany({
          where: { id: { in: staleIds.slice(0, LIST_LIMIT) } },
          select: { id: true, code: true, title: true, region: true },
        })
      : [];
  const lastViewed =
    staleIds.length > 0
      ? await prisma.viewing.groupBy({
          by: ["propertyId"],
          where: { propertyId: { in: staleIds.slice(0, LIST_LIMIT) } },
          _max: { startAt: true },
        })
      : [];
  const lastViewedMap = new Map(
    lastViewed.map((r) => [r.propertyId, r._max.startAt as Date | null])
  );
  const staleProperties: TodayStaleProperty[] = staleDetails.map((p) => ({
    id: p.id,
    code: p.code,
    title: p.title,
    region: p.region,
    lastViewedAt: lastViewedMap.get(p.id) ?? null,
  }));

  return {
    viewingsToday: {
      total: viewingsTodayTotal,
      items: viewingsToday.map((v) => ({
        id: v.id,
        startAt: v.startAt,
        status: v.status,
        customerId: v.customer.id,
        customerName: v.customer.name,
        propertyId: v.property.id,
        propertyTitle: v.property.title,
      })),
    },
    sessionCardsToday: {
      total: sessionCardsTodayTotal,
      items: sessionCardsToday.map((s) => ({
        id: s.id,
        scheduledAt: s.scheduledAt,
        status: s.status,
        customerId: s.customer.id,
        customerName: s.customer.name,
        propertyId: s.property?.id ?? null,
        propertyTitle: s.property?.title ?? null,
        advisorName: s.advisor.name,
      })),
    },
    overdueFollowUps: {
      total: overdueFollowUpsTotal + mergedFollowUps.filter((m) => m.source === "nextFollowUp").length,
      items: mergedFollowUps.slice(0, LIST_LIMIT),
    },
    unansweredLeads: {
      total: unansweredLeads.length,
      items: unansweredLeads.slice(0, LIST_LIMIT),
    },
    staleProperties: {
      total: staleIds.length,
      items: staleProperties,
    },
    visitsAwaitingReport: {
      total: unreportedTotal,
      items: unreported.map((v) => ({
        id: v.id,
        startAt: v.startAt,
        customerId: v.customer.id,
        customerName: v.customer.name,
        propertyId: v.property.id,
        propertyTitle: v.property.title,
        agentName: v.agent.name,
      })),
    },
  };
}
