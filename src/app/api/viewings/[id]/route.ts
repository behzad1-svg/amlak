import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { viewingUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.viewing.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && existing.agentId !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  const parsed = viewingUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const wasDone = existing.status === "DONE";
  const data: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) data.status = parsed.data.status;
  if (parsed.data.feedback !== undefined) data.feedback = parsed.data.feedback;
  if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
  if (parsed.data.startAt !== undefined) data.startAt = new Date(parsed.data.startAt);
  if (data.status === "DONE" && !data.endAt && !existing.endAt) return NextResponse.json({ error: "زمان پایان الزامی است" }, { status: 400 });
  const viewing = await prisma.viewing.update({ where: { id }, data });
  await createAuditLog({ actorId: session.user.id, action: "VIEWING_UPDATED", entityType: "Viewing", entityId: id, oldValue: { status: existing.status } as never, newValue: { status: viewing.status } as never });
  if (!wasDone && viewing.status === "DONE") {
    await prisma.activity.create({ data: { type: "VIEWING_DONE", agentId: viewing.agentId, customerId: viewing.customerId, propertyId: viewing.propertyId, description: "بازدید انجام شد" } });
  }
  return NextResponse.json(serializeBigInt(viewing));
}
