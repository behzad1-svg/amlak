import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { followUpUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.followUp.findUnique({ where: { id }, include: { customer: true } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (existing.customer.deletedAt || !canAccessCustomer(session.user, { assignedAgentId: existing.customer.assignedAgentId })) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  const parsed = followUpUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.dueAt !== undefined) data.dueAt = new Date(parsed.data.dueAt);
  if (parsed.data.note !== undefined) data.note = parsed.data.note;
  if (parsed.data.done !== undefined) {
    data.done = parsed.data.done;
    data.doneAt = parsed.data.done ? new Date() : null;
  }
  const updated = await prisma.followUp.update({ where: { id }, data });
  const next = await prisma.followUp.findFirst({ where: { customerId: existing.customerId, done: false }, orderBy: { dueAt: "asc" } });
  await prisma.customer.update({ where: { id: existing.customerId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
  await createAuditLog({ actorId: session.user.id, action: "FOLLOW_UP_UPDATED", entityType: "FollowUp", entityId: id });
  return NextResponse.json(serializeBigInt(updated));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  // حذف پیگیری هم فقط مدیر — مشاور می‌تواند «انجام شد» بزند
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند پیگیری را حذف کند" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.followUp.findUnique({ where: { id }, include: { customer: true } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (existing.customer.deletedAt || !canAccessCustomer(session.user, { assignedAgentId: existing.customer.assignedAgentId })) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  await prisma.followUp.delete({ where: { id } });
  const next = await prisma.followUp.findFirst({ where: { customerId: existing.customerId, done: false }, orderBy: { dueAt: "asc" } });
  await prisma.customer.update({ where: { id: existing.customerId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
  await createAuditLog({ actorId: session.user.id, action: "FOLLOW_UP_DELETED", entityType: "FollowUp", entityId: id });
  return NextResponse.json({ ok: true });
}
