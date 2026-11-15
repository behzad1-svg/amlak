import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { customerCreateSchema, findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { getStaleInfo } from "@/lib/constants";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const showLost = searchParams.get("showLost") === "true";
  const showDeleted = searchParams.get("showDeleted") === "true";
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const budgetMin = searchParams.get("budgetMin");
  const budgetMax = searchParams.get("budgetMax");
  const sizeMin = searchParams.get("sizeMin");
  const sizeMax = searchParams.get("sizeMax");
  const agentId = searchParams.get("agentId");
  const invalidParam = findInvalidQueryParam([
    { name: "page", value: searchParams.get("page") },
    { name: "limit", value: searchParams.get("limit") },
    { name: "budgetMin", value: budgetMin },
    { name: "budgetMax", value: budgetMax },
    { name: "sizeMin", value: sizeMin, number: true },
    { name: "sizeMax", value: sizeMax, number: true },
  ]);
  if (invalidParam) {
    return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  }

  const temperature = searchParams.get("temperature");
  const preferredArea = searchParams.get("preferredArea");
  const preferredType = searchParams.get("preferredType");
  const followUp = searchParams.get("followUp"); // overdue | today | none
  const sort = searchParams.get("sort") ?? "followup";
  const source = searchParams.get("source");
  const tag = searchParams.get("tag");
  const staleOnly = searchParams.get("staleOnly") === "true";

  if (source && !["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "IN_PERSON", "ADVERTISEMENT", "OTHER", "FILE_FINDING"].includes(source)) {
    return NextResponse.json({ error: "مقدار «source» معتبر نیست" }, { status: 400 });
  }
  if (tag && tag.length > 30) {
    return NextResponse.json({ error: "مقدار «tag» معتبر نیست" }, { status: 400 });
  }

  if (temperature && !["HOT", "WARM", "COLD"].includes(temperature)) {
    return NextResponse.json({ error: "مقدار «temperature» معتبر نیست" }, { status: 400 });
  }
  if (followUp && !["overdue", "today", "none"].includes(followUp)) {
    return NextResponse.json({ error: "مقدار «followUp» معتبر نیست" }, { status: 400 });
  }
  if (!["followup", "newest", "name"].includes(sort)) {
    return NextResponse.json({ error: "مقدار «sort» معتبر نیست" }, { status: 400 });
  }

  const and: Record<string, unknown>[] = [];
  if (!showDeleted) and.push({ deletedAt: null });
  if (!showLost) {
    if (stage) and.push({ stage });
    else and.push({ stage: { not: "LOST" } });
  } else if (stage) {
    and.push({ stage });
  }
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
      ],
    });
  }
  if (session.user.role !== "OWNER") and.push({ assignedAgentId: session.user.id });
  else if (agentId) and.push({ assignedAgentId: agentId });
  if (budgetMin) and.push({ budgetMax: { gte: BigInt(budgetMin) } });
  if (budgetMax) and.push({ budgetMin: { lte: BigInt(budgetMax) } });
  if (sizeMin) and.push({ preferredSizeMax: { gte: parseFloat(sizeMin) } });
  if (sizeMax) and.push({ preferredSizeMin: { lte: parseFloat(sizeMax) } });
  if (temperature === "HOT" || temperature === "WARM" || temperature === "COLD") and.push({ temperature });
  if (source) and.push({ source });
  if (tag) and.push({ tags: { has: tag } });
  if (preferredType) and.push({ preferredType });
  if (preferredArea) {
    and.push({
      OR: [{ preferredArea }, { preferredAreas: { has: preferredArea } }],
    });
  }
  if (followUp === "overdue") {
    and.push({
      nextFollowUpAt: { lt: new Date() },
      stage: { notIn: ["LOST", "FAILED", "WON", "CONTRACT"] },
    });
  } else if (followUp === "today") {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    and.push({ nextFollowUpAt: { gte: startOfToday, lt: startOfTomorrow } });
  } else if (followUp === "none") {
    and.push({ nextFollowUpAt: null });
  }

  // «فقط راکدها»: اول شناسهٔ مشتری‌هایی را پیدا کن که از آخرین فعالیتشان
  // بیش از سقف مرحله‌شان گذشته، بعد همان where را به آن شناسه‌ها محدود کن.
  if (staleOnly) {
    const candidates = await prisma.customer.findMany({
      where: { AND: and } as Record<string, unknown>,
      select: { id: true, stage: true, createdAt: true },
      take: 5000,
    });
    const ids = candidates.map((c) => c.id);
    const lastActs = ids.length
      ? await prisma.activity.groupBy({
          by: ["customerId"],
          where: { customerId: { in: ids } },
          _max: { createdAt: true },
        })
      : [];
    const lastById = new Map(lastActs.map((a) => [a.customerId as string, a._max.createdAt as Date | null]));
    const staleIds = candidates
      .filter((c) => getStaleInfo(c.stage, lastById.get(c.id) ?? c.createdAt))
      .map((c) => c.id);
    and.push({ id: { in: staleIds } });
  }

  const where = { AND: and } as Record<string, unknown>;

  // نقد ۳ — شمارش صادقانهٔ هر مرحله با همان فیلترها، تا ستون‌های کانبان
  // تعداد واقعی را نشان دهند نه فقط تعداد کارت‌های بارگذاری‌شده را.
  const [customers, total, stageGroups, sourceGroups] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { assignedAgent: { select: { id: true, name: true } } },
      orderBy:
        sort === "newest"
          ? [{ createdAt: "desc" }]
          : sort === "name"
            ? [{ name: "asc" }, { createdAt: "desc" }]
            : [{ nextFollowUpAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.customer.count({ where }),
    prisma.customer.groupBy({ by: ["stage"], where, _count: true }),
    prisma.customer.groupBy({ by: ["source", "stage"], where, _count: true }),
  ]);
  const stageCounts: Record<string, number> = {};
  for (const g of stageGroups) stageCounts[g.stage] = g._count;
  // آمار منبع: تعداد مشتری و تعداد رسیده به قرارداد (مرحله CONTRACT یا WON) برای هر منبع
  const sourceStatsMap = new Map<string | null, { source: string | null; total: number; contracts: number }>();
  for (const g of sourceGroups) {
    const key = g.source as string | null;
    const row = sourceStatsMap.get(key) ?? { source: key, total: 0, contracts: 0 };
    row.total += g._count;
    if (g.stage === "CONTRACT" || g.stage === "WON") row.contracts += g._count;
    sourceStatsMap.set(key, row);
  }
  const sourceStats = [...sourceStatsMap.values()].sort((a, b) => b.total - a.total);
  // آخرین فعالیت هر مشتری (برای بج «راکد») — اگر فعالیتی نیست، تاریخ ثبت مشتری
  const pageIds = customers.map((c) => c.id);
  const pageLastActs = pageIds.length
    ? await prisma.activity.groupBy({
        by: ["customerId"],
        where: { customerId: { in: pageIds } },
        _max: { createdAt: true },
      })
    : [];
  const pageLastById = new Map(pageLastActs.map((a) => [a.customerId as string, a._max.createdAt as Date | null]));
  const customersWithActivity = customers.map((c) => ({
    ...c,
    lastActivityAt: pageLastById.get(c.id) ?? c.createdAt,
  }));

  // Kanban صفحه همیشه کل لیست را می‌خواهد — اگر page/limit پیش‌فرض بود، همان آرایه ساده برگردان
  const isDefaultPage = !searchParams.has("page") && !searchParams.has("limit");
  if (isDefaultPage) return NextResponse.json(serializeBigInt(customersWithActivity));
  return NextResponse.json({ ...serializeBigInt({ customers: customersWithActivity }), total, page, limit, stageCounts, sourceStats });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (!hasPermission(session.user, "canCreateCustomer")) {
    return NextResponse.json({ error: "اجازه ثبت مشتری ندارید" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = customerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const d = parsed.data;

  // LOST validation
  if (d.stage === "LOST" && !d.lostReasonCategory) {
    return NextResponse.json({ error: "دلیل از دست رفتن الزامی است" }, { status: 400 });
  }

  // مرحله «موفق» فقط از مسیر معامله می‌آید — ساخت مشتری مستقیم در مرحله WON مجاز نیست
  if (d.stage === "WON") {
    return NextResponse.json(
      { error: "مرحله «موفق» فقط با ثبت معامله قطعی ثبت می‌شود؛ ابتدا معامله را قطعی کنید" },
      { status: 409 }
    );
  }

  let assignedAgentId = session.user.id;
  if (session.user.role === "OWNER" && d.assignedAgentId) {
    const agent = await prisma.user.findUnique({ where: { id: d.assignedAgentId } });
    if (!agent || !agent.active) {
      return NextResponse.json({ error: "مشاور انتخاب‌شده معتبر نیست" }, { status: 400 });
    }
    assignedAgentId = agent.id;
  }

  const phoneClash = await prisma.customer.findUnique({ where: { phone: d.phone } });
  if (phoneClash) {
    return NextResponse.json(
      { error: "مشتری با این شماره قبلا ثبت شده است" },
      { status: 409 }
    );
  }

  const customer = await prisma.customer.create({
    data: {
      name: d.name,
      phone: d.phone,
      type: d.type as never,
      stage: (d.stage as never) ?? "INITIAL_CONTACT",
      temperature: (d.temperature as never) ?? "WARM",
      source: d.source as never,
      tags: d.tags ?? [],
      notes: d.notes,
      description: d.description,
      preferredType: d.preferredType as never,
      preferredDealType: d.preferredDealType as never,
      preferredArea: d.preferredArea,
      preferredAreas: d.preferredAreas ?? [],
      preferredBeds: d.preferredBeds,
      preferredSizeMin: d.preferredSizeMin,
      preferredSizeMax: d.preferredSizeMax,
      budgetMin: d.budgetMin ? BigInt(d.budgetMin) : null,
      budgetMax: d.budgetMax ? BigInt(d.budgetMax) : null,
      budgetMaxMonthly: (d as { budgetMaxMonthly?: string | null }).budgetMaxMonthly
        ? BigInt((d as { budgetMaxMonthly: string }).budgetMaxMonthly)
        : null,
      nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
      needsManagerReview: d.needsManagerReview ?? false,
      managerReviewReason: d.managerReviewReason,
      managerReviewRequestedAt: d.needsManagerReview ? new Date() : null,
      lostReasonCategory: d.lostReasonCategory as never,
      lostReasonDetail: d.lostReasonDetail,
      lostAt: d.stage === "LOST" ? new Date() : null,
      assignedAgentId,
    },
  });

  // Notification for manager review
  if (d.needsManagerReview) {
    const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true } });
    for (const owner of owners) {
      await prisma.notification.create({
        data: {
          userId: owner.id,
          type: "FOLLOW_UP_OVERDUE",
          priority: "HIGH",
          relatedType: "Customer",
          relatedId: customer.id,
          message: `درخواست بررسی مدیر: ${d.name} — ${d.managerReviewReason ?? ""}`,
        },
      });
    }
  }

  if (d.nextFollowUpAt) {
    try { await prisma.followUp.create({ data: { customerId: customer.id, dueAt: new Date(d.nextFollowUpAt) } }); } catch {}
  }

    await createAuditLog({ actorId: session.user.id, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id, newValue: { name: d.name } as never });

  // Matching — شکست تطبیق نباید بی‌صدا رد شود
  try { await runMatchingForCustomer(customer.id, session.user.id); } catch (e) {
    console.error("[matching] runMatchingForCustomer failed for", customer.id, e instanceof Error ? e.message : e);
  }

  // Activity
  await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: customer.id, description: `مشتری جدید: ${d.name}`, newValue: d.stage ?? "INITIAL_CONTACT" } });

  return NextResponse.json(serializeBigInt(customer), { status: 201 });
}
