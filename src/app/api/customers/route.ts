import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { customerCreateSchema, findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

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

  const where = { AND: and } as Record<string, unknown>;

  const [customers, total] = await Promise.all([
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
  ]);

  // Kanban صفحه همیشه کل لیست را می‌خواهد — اگر page/limit پیش‌فرض بود، همان آرایه ساده برگردان
  const isDefaultPage = !searchParams.has("page") && !searchParams.has("limit");
  if (isDefaultPage) return NextResponse.json(serializeBigInt(customers));
  return NextResponse.json({ ...serializeBigInt({ customers }), total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

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
      { error: "مشتری با این شماره قبلا ثبت شده است", existingId: phoneClash.id },
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

  // Matching
  try { await runMatchingForCustomer(customer.id, session.user.id); } catch {}

  // Activity
  await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: customer.id, description: `مشتری جدید: ${d.name}`, newValue: d.stage ?? "INITIAL_CONTACT" } });

  return NextResponse.json(serializeBigInt(customer), { status: 201 });
}
