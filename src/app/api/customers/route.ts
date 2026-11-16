import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { budgetStringToBigInt, customerCreateSchema, findInvalidQueryParam, safeBigInt } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { getStaleInfo } from "@/lib/constants";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { persianSearchOr } from "@/lib/search";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stage = searchParams.get("stage");
  const showLost = searchParams.get("showLost") === "true";
  const showDeleted = session.user.role === "OWNER" && searchParams.get("showDeleted") === "true";
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
    { name: "budgetMin", value: budgetMin, bigint: true },
    { name: "budgetMax", value: budgetMax, bigint: true },
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
  const type = searchParams.get("type");
  const category = searchParams.get("category"); // owners | customers
  const staleOnly = searchParams.get("staleOnly") === "true";

  if (source && !["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "IN_PERSON", "ADVERTISEMENT", "OTHER", "FILE_FINDING"].includes(source)) {
    return NextResponse.json({ error: "مقدار «source» معتبر نیست" }, { status: 400 });
  }
  if (tag && tag.length > 30) {
    return NextResponse.json({ error: "مقدار «tag» معتبر نیست" }, { status: 400 });
  }
  if (type && !["BUYER", "SELLER", "TENANT", "OWNER"].includes(type)) {
    return NextResponse.json({ error: "مقدار «type» معتبر نیست" }, { status: 400 });
  }
  if (stage && !["NEW", "INITIAL_CONTACT", "QUALIFIED", "VIEWING", "CONTRACT", "WON", "FAILED", "LOST"].includes(stage)) {
    return NextResponse.json({ error: "مقدار «stage» معتبر نیست" }, { status: 400 });
  }
  if (category && !["owners", "customers"].includes(category)) {
    return NextResponse.json({ error: "مقدار «category» معتبر نیست" }, { status: 400 });
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
    // جستجوی فارسی با نیم‌فاصله برای نام؛ شماره تلفن بدون تغییر
    and.push({
      OR: [
        ...persianSearchOr(["name"], search),
        { phone: { contains: search } },
      ],
    });
  }
  if (session.user.role !== "OWNER") and.push({ assignedAgentId: session.user.id });
  else if (agentId) and.push({ assignedAgentId: agentId });
  const budgetMinValue = safeBigInt(budgetMin);
  if (budgetMinValue !== null) and.push({ budgetMax: { gte: budgetMinValue } });
  const budgetMaxValue = safeBigInt(budgetMax);
  if (budgetMaxValue !== null) and.push({ budgetMin: { lte: budgetMaxValue } });
  if (sizeMin) and.push({ preferredSizeMax: { gte: parseFloat(sizeMin) } });
  if (sizeMax) and.push({ preferredSizeMin: { lte: parseFloat(sizeMax) } });
  if (temperature === "HOT" || temperature === "WARM" || temperature === "COLD") and.push({ temperature });
  if (source) and.push({ source });
  if (type) and.push({ type });
  if (category === "owners") and.push({ type: "OWNER" });
  else if (category === "customers") and.push({ type: { in: ["BUYER", "SELLER", "TENANT"] } });
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
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (!hasPermission(session.user, "canCreateCustomer")) {
    return NextResponse.json({ error: "اجازه ثبت مشتری ندارید" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
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

  // یک شماره در هر دسته یک بار: مالک (OWNER) جدا از مشتری (BUYER/SELLER/TENANT) —
  // اگر مالکی بعداً مشتری شد، به‌عنوان مشتریِ تازه ثبت می‌شود (و برعکس).
  // فقط رکوردهای فعال دیده می‌شوند (شمارهٔ یک مشتری حذف‌شده قابل استفادهٔ دوباره است).
  const isOwner = d.type === "OWNER";
  const phoneClash = await prisma.customer.findFirst({
    where: { phone: d.phone, deletedAt: null, ...(isOwner ? { type: "OWNER" } : { type: { not: "OWNER" } }) },
  });
  if (phoneClash) {
    return NextResponse.json(
      {
        error: isOwner ? "مالک با این شماره قبلا ثبت شده است" : "مشتری با این شماره قبلا ثبت شده است",
        existingId: phoneClash.id,
      },
      { status: 409 }
    );
  }

  // اگر همین شماره با همین دسته قبلاً حذف شده باشد، رکورد حذف‌شده را بازیابی
  // می‌کنیم (deletedAt را پاک می‌کنیم) و با فیلدهای درخواست به‌روز می‌کنیم؛
  // در غیر این صورت محدودیت یکتای [phone, type] در دیتابیس با خطای 500
  // (P2002) شکست می‌خورد. اول رکورد هم‌نوع را ترجیح می‌دهیم.
  const deletedMatch =
    (await prisma.customer.findFirst({
      where: { phone: d.phone, type: d.type as never, deletedAt: { not: null } },
    })) ??
    (await prisma.customer.findFirst({
      where: { phone: d.phone, deletedAt: { not: null }, ...(isOwner ? { type: "OWNER" } : { type: { not: "OWNER" } }) },
      orderBy: { deletedAt: "desc" },
    }));

  // دادهٔ مشترک ساخت و بازیابی — برای بازیابی، فیلدهای خالی صراحتاً null
  // می‌شوند تا مقدارهای قدیمی رکورد حذف‌شده باقی نمانند.
  const customerData = {
    name: d.name,
    phone: d.phone,
    type: d.type as never,
    stage: (d.stage as never) ?? "INITIAL_CONTACT",
    temperature: (d.temperature as never) ?? "WARM",
    source: (d.source as never) ?? null,
    tags: d.tags ?? [],
    notes: d.notes ?? null,
    description: d.description ?? null,
    preferredType: d.preferredType ?? null,
    preferredDealType: (d.preferredDealType as never) ?? null,
    preferredArea: d.preferredArea ?? null,
    preferredAreas: d.preferredAreas ?? [],
    preferredBeds: d.preferredBeds ?? null,
    preferredSizeMin: d.preferredSizeMin ?? null,
    preferredSizeMax: d.preferredSizeMax ?? null,
    budgetMin: budgetStringToBigInt(d.budgetMin),
    budgetMax: budgetStringToBigInt(d.budgetMax),
    budgetMaxMonthly: budgetStringToBigInt((d as { budgetMaxMonthly?: string | null }).budgetMaxMonthly),
    nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
    needsManagerReview: d.needsManagerReview ?? false,
    managerReviewReason: d.managerReviewReason ?? null,
    managerReviewRequestedAt: d.needsManagerReview ? new Date() : null,
    lostReasonCategory: (d.lostReasonCategory as never) ?? null,
    lostReasonDetail: d.lostReasonDetail ?? null,
    lostAt: d.stage === "LOST" ? new Date() : null,
    assignedAgentId,
  };

  let customer: Awaited<ReturnType<typeof prisma.customer.create>>;
  try {
    customer = deletedMatch
      ? await prisma.customer.update({
          where: { id: deletedMatch.id },
          data: { ...customerData, deletedAt: null },
        })
      : await prisma.customer.create({ data: customerData });
  } catch (e) {
    // P2002: در حالت نادر چند رکورد حذف‌شدهٔ هم‌شماره (مثلاً BUYER و SELLER)
    // بازیابی می‌تواند با یکتای [phone, type] برخورد کند.
    if ((e as { code?: string }).code === "P2002") {
      // رکورد متعارض را پیدا کن تا UI بتواند به آن لینک بدهد
      const clash = await prisma.customer.findFirst({
        where: { phone: d.phone, ...(isOwner ? { type: "OWNER" } : { type: { not: "OWNER" } }) },
      });
      return NextResponse.json(
        {
          error: isOwner ? "مالک با این شماره قبلا ثبت شده است" : "مشتری با این شماره قبلا ثبت شده است",
          existingId: clash?.id ?? null,
        },
        { status: 409 }
      );
    }
    throw e;
  }

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

    await createAuditLog({ actorId: session.user.id, action: deletedMatch ? "CUSTOMER_RESTORED" : "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id, newValue: { name: d.name } as never });

  // Matching — شکست تطبیق نباید بی‌صدا رد شود
  try { await runMatchingForCustomer(customer.id, session.user.id); } catch (e) {
    console.error("[matching] runMatchingForCustomer failed for", customer.id, e instanceof Error ? e.message : e);
  }

  // Activity
  await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: customer.id, description: deletedMatch ? `مشتری بازیابی شد: ${d.name}` : `مشتری جدید: ${d.name}`, newValue: d.stage ?? "INITIAL_CONTACT" } });

  return NextResponse.json(serializeBigInt(customer), { status: 201 });
}
