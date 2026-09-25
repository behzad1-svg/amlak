import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const userId = session.user.id;
  const isOwner = session.user.role === "OWNER";
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const overdueWhere: Record<string, unknown> = { deletedAt: null, stage: { not: "LOST" }, nextFollowUpAt: { lt: now } };
  if (!isOwner) overdueWhere.assignedAgentId = userId;
  const overdueCustomers = await prisma.customer.findMany({ where: overdueWhere, include: { assignedAgent: { select: { id: true, name: true } } }, orderBy: { nextFollowUpAt: "asc" } });

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  const todayWhere: Record<string, unknown> = { deletedAt: null, stage: { not: "LOST" }, nextFollowUpAt: { gte: now, lte: todayEnd } };
  if (!isOwner) todayWhere.assignedAgentId = userId;
  const todayFollowUps = await prisma.customer.findMany({ where: todayWhere, orderBy: { nextFollowUpAt: "asc" } });

  const reviewWhere: Record<string, unknown> = { deletedAt: null, needsManagerReview: true };
  if (!isOwner) reviewWhere.assignedAgentId = userId;
  const needsReview = await prisma.customer.findMany({ where: reviewWhere });

  const tasks = await prisma.task.findMany({ where: { assignedAgentId: userId, done: false }, orderBy: { dueAt: "asc" }, take: 10 });

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const viewings = await prisma.viewing.findMany({
    where: { agentId: isOwner ? undefined : userId, startAt: { gte: todayStart, lte: todayEnd } },
    include: { customer: { select: { name: true } }, property: { select: { title: true } } },
    orderBy: { startAt: "asc" },
  });

  let teamStats: unknown = null;
  if (isOwner) {
    const agents = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } });
    const overdueByAgent = await prisma.customer.groupBy({ by: ["assignedAgentId"], where: { deletedAt: null, stage: { not: "LOST" }, nextFollowUpAt: { lt: new Date() } }, _count: true });
    const overdueMap = new Map(overdueByAgent.map((r) => [r.assignedAgentId, r._count]));

    const weeklyActivity = await prisma.activity.groupBy({ by: ["agentId"], where: { createdAt: { gte: weekAgo } }, _count: true });
    const weeklyMap = new Map(weeklyActivity.map((r) => [r.agentId, r._count]));
    const monthlyActivity = await prisma.activity.groupBy({ by: ["agentId"], where: { createdAt: { gte: monthAgo } }, _count: true });
    const monthlyMap = new Map(monthlyActivity.map((r) => [r.agentId, r._count]));

    // تفکیک نوع فعالیت برای مدیر
    const typeGroups = await prisma.activity.groupBy({
      by: ["agentId", "type"],
      where: { createdAt: { gte: monthAgo } },
      _count: true,
    });
    const typeMap = new Map<string, number>();
    for (const g of typeGroups) {
      typeMap.set(`${g.agentId}:${g.type}`, g._count);
    }

    const dealsByAgent = await prisma.deal.groupBy({ by: ["agentId"], _count: true });
    const dealsMap = new Map(dealsByAgent.map((r) => [r.agentId, r._count]));

    const appraisalsByAgent = await prisma.property.groupBy({
      by: ["appraisedById"],
      where: { isAppraised: true, appraisedById: { not: null }, deletedAt: null },
      _count: true,
    });
    const appraisalMap = new Map<string, number>();
    for (const a of appraisalsByAgent) {
      if (a.appraisedById) appraisalMap.set(a.appraisedById, a._count);
    }

    const listedByAgent = await prisma.property.groupBy({
      by: ["listedById"],
      where: { deletedAt: null },
      _count: true,
    });
    const listedMap = new Map(listedByAgent.map((r) => [r.listedById, r._count]));

    const viewingsByAgent = await prisma.viewing.groupBy({ by: ["agentId"], _count: true });
    const viewingMap = new Map(viewingsByAgent.map((r) => [r.agentId, r._count]));

    teamStats = agents.map((a) => ({
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
      breakdown: {
        calls: typeMap.get(`${a.id}:CALL`) ?? 0,
        notes: typeMap.get(`${a.id}:NOTE`) ?? 0,
        meetings: typeMap.get(`${a.id}:MEETING`) ?? 0,
        messages: typeMap.get(`${a.id}:MESSAGE`) ?? 0,
        appraisals: typeMap.get(`${a.id}:APPRAISAL`) ?? 0,
        viewingsDone: typeMap.get(`${a.id}:VIEWING_DONE`) ?? 0,
        stageChanges: typeMap.get(`${a.id}:STAGE_CHANGE`) ?? 0,
        advertised: typeMap.get(`${a.id}:ADVERTISED`) ?? 0,
        other: typeMap.get(`${a.id}:OTHER`) ?? 0,
      },
    }));
  }

  return NextResponse.json(serializeBigInt({ overdueCustomers, todayFollowUps, needsReview, tasks, viewings, teamStats }));
}
