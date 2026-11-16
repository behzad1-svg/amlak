import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { taskCreateSchema, findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const done = searchParams.get("done");
  const invalidParam = findInvalidQueryParam([
    { name: "page", value: searchParams.get("page") },
    { name: "limit", value: searchParams.get("limit") },
  ]);
  if (invalidParam) {
    return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  }
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const where: Record<string, unknown> = { assignedAgentId: session.user.id };
  if (done !== null) where.done = done === "true";
  const [tasks, total] = await Promise.all([
    prisma.task.findMany({ where, orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.task.count({ where }),
  ]);
  return NextResponse.json({ ...serializeBigInt({ tasks }), total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const task = await prisma.task.create({
    data: { title: d.title, dueAt: d.dueAt ? new Date(d.dueAt) : null, priority: d.priority ?? 0, customerId: d.customerId, relatedType: d.relatedType, relatedId: d.relatedId, assignedAgentId: session.user.id },
  });
  await createAuditLog({ actorId: session.user.id, action: "TASK_CREATED", entityType: "Task", entityId: task.id, newValue: { title: d.title } as never });
  return NextResponse.json(serializeBigInt(task), { status: 201 });
}
