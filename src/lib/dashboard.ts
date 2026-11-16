// نقد ۲ و ۹ — منطق دادهٔ داشبورد، مشترک بین روت API و صفحهٔ سرور (RSC).
// همهٔ کوئری‌های مستقل با Promise.all موازی اجرا می‌شوند (قبلاً ۱۴ کوئری
// پشت سر هم بود — ۸٫۸ ثانیه). لیست‌ها سقف ۱۰۰ ردیف دارند و تعداد واقعی
// جداگانه برگردانده می‌شود تا شمارنده‌ها صادقانه بمانند.
import { prisma } from "@/lib/prisma";

export type DashboardTeamStat = {
  id: string;
  name: string;
  role: string;
  overdue: number;
  weeklyActivity: number;
  monthlyActivity: number;
  deals: number;
  appraisals: number;
  listedFiles: number;
  viewings: number;
  /// آگهی‌های ۷ روز گذشتهٔ مشاور — «این هفته چند تا آگهی کرده»
  advertisedWeekly: number;
  /// کارت‌های جلسهٔ ۷ روز گذشتهٔ مشاور — «این هفته چند تا کارت جلسه ثبت کرده»
  sessionCardsWeekly: number;
  breakdown: {
    calls: number;
    notes: number;
    meetings: number;
    messages: number;
    appraisals: number;
    viewingsDone: number;
    stageChanges: number;
    advertised: number;
    sessionCards: number;
    other: number;
  };
};

export type DashboardData = {
  overdueCustomers: { id: string; name: string; phone: string; stage: string; nextFollowUpAt: Date | null }[];
  overdueTotal: number;
  todayFollowUps: { id: string; name: string; nextFollowUpAt: Date | null }[];
  todayTotal: number;
  needsReview: { id: string; name: string; managerReviewReason: string | null }[];
  needsReviewTotal: number;
  tasks: { id: string; title: string; dueAt: Date | null }[];
  viewings: { id: string; startAt: Date; customer: { name: string }; property: { title: string } }[];
  teamStats: DashboardTeamStat[] | null;
};

const LIST_LIMIT = 100;

export async function getDashboardData(userId: string, isOwner: boolean): Promise<DashboardData> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const overdueWhere: Record<string, unknown> = {
    deletedAt: null,
    stage: { not: "LOST" },
    nextFollowUpAt: { lt: now },
  };
  if (!isOwner) overdueWhere.assignedAgentId = userId;
  const todayWhere: Record<string, unknown> = {
    deletedAt: null,
    stage: { not: "LOST" },
    nextFollowUpAt: { gte: now, lte: todayEnd },
  };
  if (!isOwner) todayWhere.assignedAgentId = userId;
  const reviewWhere: Record<string, unknown> = { deletedAt: null, needsManagerReview: true };
  if (!isOwner) reviewWhere.assignedAgentId = userId;

  const [overdueCustomers, overdueTotal, todayFollowUps, todayTotal, needsReview, needsReviewTotal, tasks, viewings, teamStats] =
    await Promise.all([
      prisma.customer.findMany({
        where: overdueWhere,
        select: { id: true, name: true, phone: true, stage: true, nextFollowUpAt: true },
        orderBy: { nextFollowUpAt: "asc" },
        take: LIST_LIMIT,
      }),
      prisma.customer.count({ where: overdueWhere }),
      prisma.customer.findMany({
        where: todayWhere,
        select: { id: true, name: true, nextFollowUpAt: true },
        orderBy: { nextFollowUpAt: "asc" },
        take: LIST_LIMIT,
      }),
      prisma.customer.count({ where: todayWhere }),
      prisma.customer.findMany({
        where: reviewWhere,
        select: { id: true, name: true, managerReviewReason: true },
        take: LIST_LIMIT,
      }),
      prisma.customer.count({ where: reviewWhere }),
      prisma.task.findMany({
        where: { assignedAgentId: userId, done: false },
        select: { id: true, title: true, dueAt: true },
        orderBy: { dueAt: "asc" },
        take: 10,
      }),
      prisma.viewing.findMany({
        where: { agentId: isOwner ? undefined : userId, startAt: { gte: todayStart, lte: todayEnd } },
        select: { id: true, startAt: true, customer: { select: { name: true } }, property: { select: { title: true } } },
        orderBy: { startAt: "asc" },
        take: 50,
      }),
      isOwner ? getTeamStats(weekAgo, monthAgo) : Promise.resolve(null),
    ]);

  return { overdueCustomers, overdueTotal, todayFollowUps, todayTotal, needsReview, needsReviewTotal, tasks, viewings, teamStats };
}

async function getTeamStats(weekAgo: Date, monthAgo: Date): Promise<DashboardTeamStat[]> {
  const [agents, overdueByAgent, weeklyActivity, monthlyActivity, typeGroups, dealsByAgent, appraisalsByAgent, listedByAgent, viewingsByAgent, advertisedWeeklyByAgent, sessionCardsWeeklyByAgent] =
    await Promise.all([
      prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } }),
      prisma.customer.groupBy({
        by: ["assignedAgentId"],
        where: { deletedAt: null, stage: { not: "LOST" }, nextFollowUpAt: { lt: new Date() } },
        _count: true,
      }),
      prisma.activity.groupBy({ by: ["agentId"], where: { createdAt: { gte: weekAgo } }, _count: true }),
      prisma.activity.groupBy({ by: ["agentId"], where: { createdAt: { gte: monthAgo } }, _count: true }),
      prisma.activity.groupBy({
        by: ["agentId", "type"],
        where: { createdAt: { gte: monthAgo } },
        _count: true,
      }),
      prisma.deal.groupBy({ by: ["agentId"], _count: true }),
      prisma.property.groupBy({
        by: ["appraisedById"],
        where: { isAppraised: true, appraisedById: { not: null }, deletedAt: null },
        _count: true,
      }),
      prisma.property.groupBy({ by: ["listedById"], where: { deletedAt: null }, _count: true }),
      prisma.viewing.groupBy({ by: ["agentId"], _count: true }),
      // آگهی‌های ۷ روز گذشته — ستون «آگهی هفته» در وضعیت تیم
      prisma.activity.groupBy({ by: ["agentId"], where: { type: "ADVERTISED", createdAt: { gte: weekAgo } }, _count: true }),
      // کارت‌های جلسهٔ ۷ روز گذشته — ستون «کارت جلسه هفته» در وضعیت تیم
      prisma.activity.groupBy({ by: ["agentId"], where: { type: "SESSION_CARD", createdAt: { gte: weekAgo } }, _count: true }),
    ]);

  const overdueMap = new Map(overdueByAgent.map((r) => [r.assignedAgentId, r._count]));
  const weeklyMap = new Map(weeklyActivity.map((r) => [r.agentId, r._count]));
  const monthlyMap = new Map(monthlyActivity.map((r) => [r.agentId, r._count]));
  const typeMap = new Map<string, number>();
  for (const g of typeGroups) typeMap.set(`${g.agentId}:${g.type}`, g._count);
  const dealsMap = new Map(dealsByAgent.map((r) => [r.agentId, r._count]));
  const appraisalMap = new Map<string, number>();
  for (const a of appraisalsByAgent) if (a.appraisedById) appraisalMap.set(a.appraisedById, a._count);
  const listedMap = new Map(listedByAgent.map((r) => [r.listedById, r._count]));
  const viewingMap = new Map(viewingsByAgent.map((r) => [r.agentId, r._count]));
  const advertisedWeeklyMap = new Map(advertisedWeeklyByAgent.map((r) => [r.agentId, r._count]));
  const sessionCardsWeeklyMap = new Map(sessionCardsWeeklyByAgent.map((r) => [r.agentId, r._count]));

  return agents.map((a) => ({
    id: a.id,
    name: a.name,
    role: a.role,
    overdue: overdueMap.get(a.id) ?? 0,
    weeklyActivity: weeklyMap.get(a.id) ?? 0,
    monthlyActivity: monthlyMap.get(a.id) ?? 0,
    deals: dealsMap.get(a.id) ?? 0,
    appraisals: appraisalMap.get(a.id) ?? 0,
    listedFiles: listedMap.get(a.id) ?? 0,
    viewings: viewingMap.get(a.id) ?? 0,
    advertisedWeekly: advertisedWeeklyMap.get(a.id) ?? 0,
    sessionCardsWeekly: sessionCardsWeeklyMap.get(a.id) ?? 0,
    breakdown: {
      calls: typeMap.get(`${a.id}:CALL`) ?? 0,
      notes: typeMap.get(`${a.id}:NOTE`) ?? 0,
      meetings: typeMap.get(`${a.id}:MEETING`) ?? 0,
      messages: typeMap.get(`${a.id}:MESSAGE`) ?? 0,
      appraisals: typeMap.get(`${a.id}:APPRAISAL`) ?? 0,
      viewingsDone: typeMap.get(`${a.id}:VIEWING_DONE`) ?? 0,
      stageChanges: typeMap.get(`${a.id}:STAGE_CHANGE`) ?? 0,
      advertised: typeMap.get(`${a.id}:ADVERTISED`) ?? 0,
      sessionCards: typeMap.get(`${a.id}:SESSION_CARD`) ?? 0,
      other: typeMap.get(`${a.id}:OTHER`) ?? 0,
    },
  }));
}
