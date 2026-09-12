import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { viewingCreateSchema } from "@/lib/validation";
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
  const customerId = searchParams.get("customerId");
  const propertyId = searchParams.get("propertyId");
  const where: Record<string, unknown> = {};
  if (customerId) where.customerId = customerId;
  if (propertyId) where.propertyId = propertyId;
  if (session.user.role !== "OWNER") where.agentId = session.user.id;
  const viewings = await prisma.viewing.findMany({ where, include: { customer: { select: { id: true, name: true } }, property: { select: { id: true, title: true } }, agent: { select: { id: true, name: true } } }, orderBy: { startAt: "desc" } });
  return NextResponse.json(serializeBigInt(viewings));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = viewingCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  if (d.endAt && new Date(d.endAt) <= new Date(d.startAt)) return NextResponse.json({ error: "زمان پایان باید بعد از شروع باشد" }, { status: 400 });
  if (d.status === "DONE" && !d.endAt) return NextResponse.json({ error: "برای بازدید انجام‌شده، زمان پایان الزامی است" }, { status: 400 });
  const viewing = await prisma.viewing.create({
    data: { customerId: d.customerId, propertyId: d.propertyId, agentId: session.user.id, startAt: new Date(d.startAt), endAt: d.endAt ? new Date(d.endAt) : null, status: (d.status as never) ?? "SCHEDULED", feedback: d.feedback },
  });
  if (viewing.status === "DONE") {
    await prisma.activity.create({ data: { type: "VIEWING_DONE", agentId: session.user.id, customerId: d.customerId, propertyId: d.propertyId, description: `بازدید انجام شد` } });
  }
  return NextResponse.json(serializeBigInt(viewing), { status: 201 });
}
