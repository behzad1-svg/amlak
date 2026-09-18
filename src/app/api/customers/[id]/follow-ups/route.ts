import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { followUpCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
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
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const followUps = await prisma.followUp.findMany({ where: { customerId: id }, orderBy: { dueAt: "asc" } });
  return NextResponse.json(serializeBigInt(followUps));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  // Accept single or array
  const items = Array.isArray(body) ? body : [body];
  const created = [];
  for (const item of items) {
    const parsed = followUpCreateSchema.safeParse(item);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const f = await prisma.followUp.create({ data: { customerId: id, dueAt: new Date(parsed.data.dueAt), note: parsed.data.note } });
    created.push(f);
    await createAuditLog({ actorId: session.user.id, action: "FOLLOW_UP_CREATED", entityType: "FollowUp", entityId: f.id });
  }
  // Also keep nextFollowUpAt in sync = earliest undone
  const next = await prisma.followUp.findFirst({ where: { customerId: id, done: false }, orderBy: { dueAt: "asc" } });
  await prisma.customer.update({ where: { id }, data: { nextFollowUpAt: next?.dueAt ?? null } });
  return NextResponse.json(serializeBigInt(created.length === 1 ? created[0] : created), { status: 201 });
}
