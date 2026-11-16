import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

/**
 * گزارش عملکرد مشاوران — فقط مدیر.
 * GET /api/reports/performance?range=7|30|90 (پیش‌فرض ۳۰ روز)
 * به‌ازای هر کاربر فعال: فایل ثبت‌شده، کارشناسی، آگهی، کارت جلسه، فایل‌یابی،
 * بازدید (غیر از لغوشده)، قرارداد (معامله قطعی) و پیگیری عقب‌افتادهٔ جاری.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر به گزارش عملکرد دسترسی دارد" }, { status: 403 });
  }

  const rawRange = new URL(req.url).searchParams.get("range") ?? "30";
  const range = ["7", "30", "90"].includes(rawRange) ? parseInt(rawRange) : 30;
  const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [users, files, appraisals, advertised, sessionCards, fileFindings, viewings, deals, overdue] = await Promise.all([
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
      where: { startAt: { gte: since }, status: { not: "CANCELED" } },
      _count: true,
    }),
    prisma.deal.groupBy({
      by: ["agentId"],
      where: { status: "COMPLETED", createdAt: { gte: since } },
      _count: true,
    }),
    prisma.customer.groupBy({
      by: ["assignedAgentId"],
      where: { deletedAt: null, stage: { not: "LOST" }, nextFollowUpAt: { lt: now } },
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
  const dealMap = new Map(deals.map((r) => [r.agentId, r._count]));
  const overdueMap = new Map(overdue.map((r) => [r.assignedAgentId, r._count]));

  const rows = users.map((u) => ({
    id: u.id,
    name: u.name,
    role: u.role,
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
