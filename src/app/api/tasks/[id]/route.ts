import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { taskUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (existing.assignedAgentId !== session.user.id && session.user.role !== "OWNER") return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const data: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.done !== undefined) data.done = parsed.data.done;
  if (parsed.data.priority !== undefined) data.priority = parsed.data.priority;
  if (parsed.data.dueAt !== undefined) data.dueAt = parsed.data.dueAt ? new Date(parsed.data.dueAt) : null;
  const task = await prisma.task.update({ where: { id }, data });
  await createAuditLog({ actorId: session.user.id, action: "TASK_UPDATED", entityType: "Task", entityId: id, newValue: data as never });
  return NextResponse.json(serializeBigInt(task));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند وظیفه را حذف کند" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  await prisma.task.delete({ where: { id } });
  await createAuditLog({ actorId: session.user.id, action: "TASK_DELETED", entityType: "Task", entityId: id });
  return NextResponse.json({ ok: true });
}
