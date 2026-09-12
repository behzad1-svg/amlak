import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { customerCreateSchema } from "@/lib/validation";
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

  const where: Record<string, unknown> = {};
  if (!showDeleted) where.deletedAt = null;
  if (!showLost) {
    if (stage) where.stage = stage;
    else where.stage = { not: "LOST" };
  } else if (stage) {
    where.stage = stage;
  }
  if (search) where.name = { contains: search, mode: "insensitive" };
  if (session.user.role !== "OWNER") where.assignedAgentId = session.user.id;

  const customers = await prisma.customer.findMany({
    where,
    include: { assignedAgent: { select: { id: true, name: true } } },
    orderBy: [{ nextFollowUpAt: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(serializeBigInt(customers));
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

  const customer = await prisma.customer.create({
    data: {
      name: d.name,
      phone: d.phone,
      type: d.type as never,
      stage: (d.stage as never) ?? "NEW",
      temperature: (d.temperature as never) ?? "WARM",
      source: d.source as never,
      notes: d.notes,
      preferredType: d.preferredType as never,
      preferredDealType: d.preferredDealType as never,
      preferredArea: d.preferredArea,
      preferredBeds: d.preferredBeds,
      preferredSizeMin: d.preferredSizeMin,
      preferredSizeMax: d.preferredSizeMax,
      budgetMin: d.budgetMin ? BigInt(d.budgetMin) : null,
      budgetMax: d.budgetMax ? BigInt(d.budgetMax) : null,
      nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt) : null,
      needsManagerReview: d.needsManagerReview ?? false,
      managerReviewReason: d.managerReviewReason,
      managerReviewRequestedAt: d.needsManagerReview ? new Date() : null,
      lostReasonCategory: d.lostReasonCategory as never,
      lostReasonDetail: d.lostReasonDetail,
      lostAt: d.stage === "LOST" ? new Date() : null,
      assignedAgentId: session.user.id,
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

  await createAuditLog({ actorId: session.user.id, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id, newValue: { name: d.name } as never });

  // Matching
  try { await runMatchingForCustomer(customer.id, session.user.id); } catch {}

  // Activity
  await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: customer.id, description: `مشتری جدید: ${d.name}`, newValue: d.stage ?? "NEW" } });

  return NextResponse.json(serializeBigInt(customer), { status: 201 });
}
