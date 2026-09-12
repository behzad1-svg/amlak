import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { taskCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const done = searchParams.get("done");
  const where: Record<string, unknown> = { assignedAgentId: session.user.id };
  if (done !== null) where.done = done === "true";
  const tasks = await prisma.task.findMany({ where, orderBy: [{ done: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }] });
  return NextResponse.json(serializeBigInt(tasks));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const task = await prisma.task.create({
    data: { title: d.title, dueAt: d.dueAt ? new Date(d.dueAt) : null, priority: d.priority ?? 0, customerId: d.customerId, relatedType: d.relatedType, relatedId: d.relatedId, assignedAgentId: session.user.id },
  });
  return NextResponse.json(serializeBigInt(task), { status: 201 });
}
