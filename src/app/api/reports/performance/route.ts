import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

/**
 * Performance report — OWNER sees everyone, each advisor sees only themself.
 * GET /api/reports/performance?range=7|30|90 (default 30 days)
 * OWNER: one row per active user, plus inactive users with activity in range
 * (so their history does not vanish from the table and totals). AGENT: only
 * their own row (and totals equal to that row) — no other row or total is
 * returned. Metrics: files filed, appraisals, advertised, session cards,
 * file findings, viewings (except canceled), deals (completed) and currently
 * overdue follow-ups. "Deals" are measured by contract date (contractAt);
 * old deals without contractAt fall back to createdAt.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";

  const rawRange = new URL(req.url).searchParams.get("range") ?? "30";
  const range = ["7", "30", "90"].includes(rawRange) ? parseInt(rawRange) : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [activeUsers, files, appraisals, advertised, sessionCards, fileFindings, viewings, deals, dealShares, overdue] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
    prisma.property.groupBy({
      by: ["listedById"],
      where: { deletedAt: null, createdAt: { gte: since } },
      _count: true,
    }),
    prisma.property.groupBy({
      by: ["appraisedById"],
      where: { deletedAt: null, isAppraised: true, appraisedById: { not: null }, appraisedAt: { gte: since } },
      _count: true,
    }),
    // آگهی — از Activity نوع ADVERTISED (هر مشاور، هر فایل، هر روز یک بار)
    prisma.activity.groupBy({
      by: ["agentId"],
      where: { type: "ADVERTISED", createdAt: { gte: since } },
      _count: true,
    }),
    // کارت جلسه — از Activity نوع SESSION_CARD (هر ثبت کارت، به نام سازندهٔ آن)
    prisma.activity.groupBy({
      by: ["agentId"],
      where: { type: "SESSION_CARD", createdAt: { gte: since } },
      _count: true,
    }),
    prisma.customer.groupBy({
      by: ["assignedAgentId"],
      where: { deletedAt: null, source: "FILE_FINDING", createdAt: { gte: since } },
      _count: true,
    }),
    prisma.viewing.groupBy({
      by: ["agentId"],
      where: { startAt: { gte: since, lte: now }, status: { not: "CANCELED" } },
      _count: true,
    }),
    prisma.deal.findMany({
      // تاریخ قرارداد ملاک است؛ معامله‌های قدیمیِ بدون contractAt با createdAt می‌آیند
      where: { status: "COMPLETED", OR: [{ contractAt: { gte: since } }, { contractAt: null, createdAt: { gte: since } }] },
      select: { id: true, agentId: true },
    }),
    // سهم مشاور همکار در معامله های قطعی بازه - همکار بیرونی (userId خالی) کاربر نیست
    prisma.dealShare.findMany({
      where: {
        userId: { not: null },
        deal: { status: "COMPLETED", OR: [{ contractAt: { gte: since } }, { contractAt: null, createdAt: { gte: since } }] },
      },
      select: { userId: true, dealId: true },
    }),
    prisma.customer.groupBy({
      by: ["assignedAgentId"],
      where: { deletedAt: null, stage: { notIn: ["LOST", "FAILED", "WON", "CONTRACT"] }, nextFollowUpAt: { lt: now } },
      _count: true,
    }),
  ]);

  const filesMap = new Map(files.map((r) => [r.listedById, r._count]));
  const appraisalMap = new Map<string, number>();
  for (const r of appraisals) if (r.appraisedById) appraisalMap.set(r.appraisedById, r._count);
  const advertisedMap = new Map(advertised.map((r) => [r.agentId, r._count]));
  const sessionCardsMap = new Map(sessionCards.map((r) => [r.agentId, r._count]));
  const findingMap = new Map(fileFindings.map((r) => [r.assignedAgentId, r._count]));
  const viewingMap = new Map(viewings.map((r) => [r.agentId, r._count]));
  // قرارداد - معامله قطعی؛ مشاور همکار (سهم) هم شمرده می شود، ولی معامله ای که
  // مشاور هم مالک آن است و هم در آن سهم دارد فقط یک بار (Set شناسه معامله به ازای هر کاربر)
  const dealIdsByUser = new Map<string, Set<string>>();
  const addDealToUser = (userId: string, dealId: string) => {
    let set = dealIdsByUser.get(userId);
    if (!set) {
      set = new Set();
      dealIdsByUser.set(userId, set);
    }
    set.add(dealId);
  };
  for (const d of deals) addDealToUser(d.agentId, d.id);
  for (const s of dealShares) if (s.userId) addDealToUser(s.userId, s.dealId);
  const dealMap = new Map([...dealIdsByUser.entries()].map(([userId, ids]) => [userId, ids.size]));
  const overdueMap = new Map(overdue.map((r) => [r.assignedAgentId, r._count]));

  // An advisor gets only their own row; OWNER gets all active users plus
  // inactive users with activity in range (otherwise their history vanishes).
  // The response is built only from this `users` list, so for an advisor no
  // other row or total leaks — even via a direct API call.
  type ReportUser = { id: string; name: string; role: string; active: boolean };
  let users: ReportUser[];
  if (isOwner) {
    const activeIds = new Set(activeUsers.map((u) => u.id));
    const groupByMaps = [filesMap, appraisalMap, advertisedMap, sessionCardsMap, findingMap, viewingMap, dealMap, overdueMap];
    const missingIds = [...new Set(groupByMaps.flatMap((m) => [...m.keys()]))].filter((id) => !activeIds.has(id));
    const inactiveUsers =
      missingIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } })
        : [];
    users = [...activeUsers.map((u) => ({ ...u, active: true })), ...inactiveUsers.map((u) => ({ ...u, active: false }))].sort((a, b) =>
      a.name.localeCompare(b.name, "fa")
    );
  } else {
    const self = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, role: true, active: true },
    });
    if (!self) return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 401 });
    users = [self];
  }

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    active: u.active,
    files: filesMap.get(u.id) ?? 0,
    appraisals: appraisalMap.get(u.id) ?? 0,
    advertised: advertisedMap.get(u.id) ?? 0,
    sessionCards: sessionCardsMap.get(u.id) ?? 0,
    fileFindings: findingMap.get(u.id) ?? 0,
    viewings: viewingMap.get(u.id) ?? 0,
    deals: dealMap.get(u.id) ?? 0,
    overdue: overdueMap.get(u.id) ?? 0,
  }));

  const totals = rows.reduce(
    (t, r) => ({
      files: t.files + r.files,
      appraisals: t.appraisals + r.appraisals,
      advertised: t.advertised + r.advertised,
      sessionCards: t.sessionCards + r.sessionCards,
      fileFindings: t.fileFindings + r.fileFindings,
      viewings: t.viewings + r.viewings,
      deals: t.deals + r.deals,
      overdue: t.overdue + r.overdue,
    }),
    { files: 0, appraisals: 0, advertised: 0, sessionCards: 0, fileFindings: 0, viewings: 0, deals: 0, overdue: 0 }
  );

  return NextResponse.json(serializeBigInt({ range, since, users: rows, totals }));
}
