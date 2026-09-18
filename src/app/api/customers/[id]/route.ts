import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { customerUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
import { runMatchingForCustomer } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id }, include: { assignedAgent: { select: { id: true, name: true } }, ownedProperties: true } });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  return NextResponse.json(serializeBigInt(customer));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, existing)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const body = await req.json();
  const parsed = customerUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  if (d.phone !== undefined && d.phone !== existing.phone) {
    const phoneClash = await prisma.customer.findUnique({ where: { phone: d.phone } });
    if (phoneClash) {
      return NextResponse.json(
        { error: "مشتری دیگری با این شماره ثبت شده است", existingId: phoneClash.id },
        { status: 409 }
      );
    }
  }

  // Stage transition guard: terminal stages back to start not allowed directly
  if ((existing.stage === "LOST" || existing.stage === "FAILED") && d.stage === "INITIAL_CONTACT") {
    return NextResponse.json({ error: "بازگشت مستقیم از این مرحله به تماس اولیه مجاز نیست" }, { status: 400 });
  }
  if (d.stage === "LOST" && !d.lostReasonCategory && !existing.lostReasonCategory) {
    return NextResponse.json({ error: "دلیل از دست رفتن الزامی است" }, { status: 400 });
  }

  const wasNeedsReview = existing.needsManagerReview;
  const nowNeedsReview = d.needsManagerReview;

  const updateData: Record<string, unknown> = {};
  if (d.name !== undefined) updateData.name = d.name;
  if (d.phone !== undefined) updateData.phone = d.phone;
  if (d.type !== undefined) updateData.type = d.type;
  if (d.stage !== undefined) {
    updateData.stage = d.stage;
    if (d.stage === "LOST") {
      updateData.lostAt = new Date();
      updateData.nextFollowUpAt = null;
    }
    if (existing.stage === "LOST" && d.stage !== "LOST") {
      updateData.lostReasonCategory = null;
      updateData.lostReasonDetail = null;
      updateData.lostAt = null;
    }
  }
  if (d.temperature !== undefined) updateData.temperature = d.temperature;
  if (d.source !== undefined) updateData.source = d.source;
  if (d.notes !== undefined) updateData.notes = d.notes;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.preferredType !== undefined) updateData.preferredType = d.preferredType;
  if (d.preferredDealType !== undefined) updateData.preferredDealType = d.preferredDealType;
  if (d.preferredArea !== undefined) updateData.preferredArea = d.preferredArea;
  if (d.preferredAreas !== undefined) updateData.preferredAreas = d.preferredAreas;
  if (d.preferredBeds !== undefined) updateData.preferredBeds = d.preferredBeds;
  if (d.preferredSizeMin !== undefined) updateData.preferredSizeMin = d.preferredSizeMin;
  if (d.preferredSizeMax !== undefined) updateData.preferredSizeMax = d.preferredSizeMax;
  if (d.budgetMin !== undefined) updateData.budgetMin = d.budgetMin ? BigInt(d.budgetMin as string) : null;
  if (d.budgetMax !== undefined) updateData.budgetMax = d.budgetMax ? BigInt(d.budgetMax as string) : null;
  if ((d as { budgetMaxMonthly?: string | null }).budgetMaxMonthly !== undefined) {
    const m = (d as { budgetMaxMonthly?: string | null }).budgetMaxMonthly;
    updateData.budgetMaxMonthly = m ? BigInt(m) : null;
  }
  if (d.nextFollowUpAt !== undefined) updateData.nextFollowUpAt = d.nextFollowUpAt ? new Date(d.nextFollowUpAt as string) : null;
  const didSetFollowUp = d.nextFollowUpAt !== undefined;
  if (d.needsManagerReview !== undefined) {
    updateData.needsManagerReview = d.needsManagerReview;
    if (d.needsManagerReview && !wasNeedsReview) {
      updateData.managerReviewRequestedAt = new Date();
    }
    if (!d.needsManagerReview) {
      updateData.managerReviewReason = null;
      updateData.managerReviewRequestedAt = null;
    }
  }
  if (d.managerReviewReason !== undefined) updateData.managerReviewReason = d.managerReviewReason;
  if (d.lostReasonCategory !== undefined) updateData.lostReasonCategory = d.lostReasonCategory;
  if (d.lostReasonDetail !== undefined) updateData.lostReasonDetail = d.lostReasonDetail;

  const customer = await prisma.customer.update({ where: { id }, data: updateData });
  if (didSetFollowUp && d.nextFollowUpAt) {
    try {
      const existingFU = await prisma.followUp.findFirst({ where: { customerId: id, done: false }, orderBy: { dueAt: "asc" } });
      if (existingFU) await prisma.followUp.update({ where: { id: existingFU.id }, data: { dueAt: new Date(d.nextFollowUpAt as string) } });
      else await prisma.followUp.create({ data: { customerId: id, dueAt: new Date(d.nextFollowUpAt as string) } });
    } catch {}
  }

  // Manager review notification
  if (nowNeedsReview && !wasNeedsReview) {
    const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true } });
    for (const owner of owners) {
      await prisma.notification.create({
        data: { userId: owner.id, type: "FOLLOW_UP_OVERDUE", priority: "HIGH", relatedType: "Customer", relatedId: id, message: `درخواست بررسی مدیر: ${customer.name} — ${d.managerReviewReason ?? ""}` },
      });
    }
  }

  // Stage change activity
  if (d.stage && d.stage !== existing.stage) {
    await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: id, oldValue: existing.stage, newValue: d.stage } });
  }

  await createAuditLog({ actorId: session.user.id, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: id });

  // Re-run matching if key fields changed
  const matchingFields = ["preferredType", "preferredDealType", "preferredArea", "preferredAreas", "budgetMax", "budgetMin", "preferredSizeMin", "preferredSizeMax"];
  if (matchingFields.some((f) => f in d)) {
    try { await runMatchingForCustomer(id, customer.assignedAgentId); } catch {}
  }

  return NextResponse.json(serializeBigInt(customer));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  // فقط مدیر می‌تواند حذف کند
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند مشتری را حذف کند" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  await createAuditLog({ actorId: session.user.id, action: "CUSTOMER_DELETED", entityType: "Customer", entityId: id });
  return NextResponse.json({ ok: true });
}
