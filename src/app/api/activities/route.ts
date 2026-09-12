import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { activityCreateSchema } from "@/lib/validation";
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
  const agentId = searchParams.get("agentId");
  const where: Record<string, unknown> = {};
  if (customerId) where.customerId = customerId;
  if (propertyId) where.propertyId = propertyId;
  if (agentId) {
    if (session.user.role !== "OWNER" && agentId !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
    where.agentId = agentId;
  } else if (session.user.role !== "OWNER") {
    where.agentId = session.user.id;
  }
  const activities = await prisma.activity.findMany({ where, include: { agent: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(serializeBigInt(activities));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = activityCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const activity = await prisma.activity.create({
    data: { type: d.type as never, agentId: session.user.id, customerId: d.customerId, propertyId: d.propertyId, description: d.description, durationMinutes: d.durationMinutes, costToman: d.costToman },
  });
  return NextResponse.json(serializeBigInt(activity), { status: 201 });
}
