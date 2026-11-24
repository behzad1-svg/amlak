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
 * `advertisedItems` lists the advertised files in range (agent, file code +
 * title, date) so the report can show WHICH file was advertised, not just
 * how many — scoped exactly like the rows (an advisor sees only their own).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";

  const rawRange = new URL(req.url).searchParams.get("range") ?? "30";
  const range = ["7", "30", "90"].includes(rawRange) ? parseInt(rawRange) : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [activeUsers, files, appraisals, advertised, sessionCards, fileFindings, viewings, deals, dealShares, overdue, advertisedItems, filesDetail, appraisalsDetail, sessionCardsDetail, fileFindingsDetail, viewingsDetail, overdueDetail] = await Promise.all([
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
      select: { id: true, agentId: true, contractAt: true, createdAt: true, customer: { select: { name: true } }, property: { select: { code: true, title: true } } },
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
    // جزئیات آگهی‌ها — ردیف‌های ADVERTISED بازه (مشاور، فایل، تاریخ)؛
    // شمارش از groupBy بالا می‌آید، اما «کدوم فایل» فقط از این ردیف‌ها معلوم می‌شود
    prisma.activity.findMany({
      where: { type: "ADVERTISED", createdAt: { gte: since } },
      select: { agentId: true, propertyId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    // جزئیات هر ستون — ردیف‌های زیرینِ همان شمارش‌های بالا، برای بازکردن
    // لیست هر مشاور با زدن روی عدد ستون
    prisma.property.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { id: true, code: true, title: true, listedById: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.property.findMany({
      where: { deletedAt: null, isAppraised: true, appraisedById: { not: null }, appraisedAt: { gte: since } },
      select: { id: true, code: true, title: true, appraisedById: true, appraisedAt: true },
      orderBy: { appraisedAt: "desc" },
    }),
    prisma.sessionCard.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true,
        advisorId: true,
        createdAt: true,
        customer: { select: { name: true } },
        property: { select: { code: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null, source: "FILE_FINDING", createdAt: { gte: since } },
      select: { id: true, name: true, assignedAgentId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.viewing.findMany({
      where: { startAt: { gte: since, lte: now }, status: { not: "CANCELED" } },
      select: {
        id: true,
        agentId: true,
        startAt: true,
        customer: { select: { name: true } },
        property: { select: { code: true, title: true } },
      },
      orderBy: { startAt: "desc" },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null, stage: { notIn: ["LOST", "FAILED", "WON", "CONTRACT"] }, nextFollowUpAt: { lt: now } },
      select: { id: true, name: true, assignedAgentId: true, nextFollowUpAt: true },
      orderBy: { nextFollowUpAt: "asc" },
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

  // فایل‌های آگهی‌شده در بازه — فقط برای کاربرانی که در پاسخ دیده می‌شوند؛
  // مشاور فقط فایل‌های خودش را می‌بیند، چون users برای او فقط خودش است.
  // کد/عنوان از خود فایل خوانده می‌شود (بدون فیلتر deletedAt — فایل حذف‌شده
  // هم باید با عنوانش دیده شود، نه به‌صورت «نامشخص»).
  const visibleIds = new Set(users.map((u) => u.id));
  const advertisedRows = advertisedItems.filter((a) => a.propertyId && visibleIds.has(a.agentId));
  const advertisedPropIds = [...new Set(advertisedRows.map((a) => a.propertyId as string))];
  const advertisedProps =
    advertisedPropIds.length > 0
      ? await prisma.property.findMany({ where: { id: { in: advertisedPropIds } }, select: { id: true, code: true, title: true } })
      : [];
  const advertisedPropMap = new Map(advertisedProps.map((p) => [p.id, p]));
  const advertisedDetail = advertisedRows.map((a) => {
    const p = advertisedPropMap.get(a.propertyId as string);
    return { agentId: a.agentId, propertyId: a.propertyId, code: p?.code ?? null, title: p?.title ?? null, date: a.createdAt };
  });

  // جزئیات ستون‌ها — همان ردیف‌های شمارش، فقط برای کاربرانِ دیده‌شده؛
  // مشاور فقط ردیف‌های خودش را می‌بیند، چون users برای او فقط خودش است.
  type ReportItem = { agentId: string; id: string; code: string | null; title: string | null; date: Date | null; href: string };
  const onlyVisible = (
    items: { agentId: string | null; id: string; code: string | null; title: string | null; date: Date | null; href: string }[]
  ): ReportItem[] => items.filter((it): it is ReportItem => !!it.agentId && visibleIds.has(it.agentId));
  const withPropertyTitle = (customerName: string, property: { code: string | null; title: string } | null) =>
    property ? `${customerName} — ${property.code ? `${property.code} — ` : ""}${property.title}` : customerName;
  const fileItems = onlyVisible(
    filesDetail.map((p) => ({ agentId: p.listedById, id: p.id, code: p.code, title: p.title, date: p.createdAt, href: `/properties/${p.id}` }))
  );
  const appraisalItems = onlyVisible(
    appraisalsDetail.map((p) => ({ agentId: p.appraisedById, id: p.id, code: p.code, title: p.title, date: p.appraisedAt, href: `/properties/${p.id}` }))
  );
  const sessionCardItems = onlyVisible(
    sessionCardsDetail.map((c) => ({
      agentId: c.advisorId,
      id: c.id,
      code: c.property?.code ?? null,
      title: withPropertyTitle(c.customer.name, c.property),
      date: c.createdAt,
      href: "/session-cards",
    }))
  );
  const fileFindingItems = onlyVisible(
    fileFindingsDetail.map((c) => ({ agentId: c.assignedAgentId, id: c.id, code: null, title: c.name, date: c.createdAt, href: `/customers/${c.id}` }))
  );
  const viewingItems = onlyVisible(
    viewingsDetail.map((v) => ({
      agentId: v.agentId,
      id: v.id,
      code: v.property?.code ?? null,
      title: withPropertyTitle(v.customer.name, v.property),
      date: v.startAt,
      href: "/viewings",
    }))
  );
  // قرارداد — مشاورِ معامله و مشاورِ همکارِ سهم‌دار، هر معامله یک بار برای هر نفر (مثل شمارش).
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const dealItemsByUser = new Map<string, ReportItem[]>();
  const addDealItem = (userId: string, dealId: string) => {
    if (!visibleIds.has(userId)) return;
    const d = dealById.get(dealId);
    if (!d) return;
    const list = dealItemsByUser.get(userId) ?? [];
    if (list.some((it) => it.id === dealId)) return;
    list.push({
      agentId: userId,
      id: d.id,
      code: d.property?.code ?? null,
      title: withPropertyTitle(d.customer.name, d.property),
      date: d.contractAt ?? d.createdAt,
      href: "/deals",
    });
    dealItemsByUser.set(userId, list);
  };
  for (const d of deals) addDealItem(d.agentId, d.id);
  for (const s of dealShares) if (s.userId) addDealItem(s.userId, s.dealId);
  const dealItems = [...dealItemsByUser.values()].flat();
  const overdueItems = onlyVisible(
    overdueDetail.map((c) => ({ agentId: c.assignedAgentId, id: c.id, code: null, title: c.name, date: c.nextFollowUpAt, href: `/customers/${c.id}` }))
  );

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

  return NextResponse.json(
    serializeBigInt({
      range,
      since,
      users: rows,
      totals,
      advertisedItems: advertisedDetail,
      fileItems,
      appraisalItems,
      sessionCardItems,
      fileFindingItems,
      viewingItems,
      dealItems,
      overdueItems,
    })
  );
}
