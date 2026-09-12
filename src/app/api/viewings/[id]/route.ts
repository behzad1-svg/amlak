import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.viewing.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && existing.agentId !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  const wasDone = existing.status === "DONE";
  const data: Record<string, unknown> = {};
  if (body.status !== undefined) data.status = body.status;
  if (body.feedback !== undefined) data.feedback = body.feedback;
  if (body.endAt !== undefined) data.endAt = body.endAt ? new Date(body.endAt) : null;
  if (body.startAt !== undefined) data.startAt = new Date(body.startAt);
  if (data.status === "DONE" && !data.endAt && !existing.endAt) return NextResponse.json({ error: "زمان پایان الزامی است" }, { status: 400 });
  const viewing = await prisma.viewing.update({ where: { id }, data });
  if (!wasDone && viewing.status === "DONE") {
    await prisma.activity.create({ data: { type: "VIEWING_DONE", agentId: viewing.agentId, customerId: viewing.customerId, propertyId: viewing.propertyId, description: "بازدید انجام شد" } });
  }
  return NextResponse.json(serializeBigInt(viewing));
}
