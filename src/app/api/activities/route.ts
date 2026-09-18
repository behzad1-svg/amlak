import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { activityCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";

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
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const where: Record<string, unknown> = {};
  if (customerId) where.customerId = customerId;
  if (propertyId) where.propertyId = propertyId;
  if (agentId) {
    if (session.user.role !== "OWNER" && agentId !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
    where.agentId = agentId;
  } else if (propertyId && session.user.role !== "OWNER") {
    // روی پرونده فایل: ثبت‌کننده فایل همه یادداشت‌ها را می‌بیند؛ بقیه فقط خودشان
    const prop = await prisma.property.findUnique({ where: { id: propertyId }, select: { listedById: true } });
    if (!prop || prop.listedById !== session.user.id) {
      where.agentId = session.user.id;
    }
  } else if (customerId && session.user.role !== "OWNER") {
    const cust = await prisma.customer.findUnique({ where: { id: customerId }, select: { assignedAgentId: true } });
    if (!cust || cust.assignedAgentId !== session.user.id) {
      where.agentId = session.user.id;
    }
  } else if (session.user.role !== "OWNER") {
    where.agentId = session.user.id;
  }
  const isDefaultPage = !new URL(req.url).searchParams.has("page") && !new URL(req.url).searchParams.has("limit");
  const [activities, total] = await Promise.all([
    prisma.activity.findMany({ where, include: { agent: { select: { id: true, name: true } }, customer: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.activity.count({ where }),
  ]);
  if (isDefaultPage) return NextResponse.json(serializeBigInt(activities));
  return NextResponse.json({ ...serializeBigInt({ activities }), total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = activityCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  // گارد: اگر به مشتری/فایل اشاره شده، باید دسترسی داشته باشد
  if (session.user.role !== "OWNER") {
    if (d.customerId) {
      const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
      if (!customer || !canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    }
    if (d.propertyId) {
      const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
      if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
      const canAccessProp = property.listedById === session.user.id || property.visibility === "TEAM_VISIBLE" || await hasRestrictedAccess(prisma as never, property.id, session.user.id);
      if (!canAccessProp) return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
    }
  }

  const activity = await prisma.activity.create({
    data: { type: d.type as never, agentId: session.user.id, customerId: d.customerId, propertyId: d.propertyId, description: d.description, durationMinutes: d.durationMinutes, costToman: d.costToman },
  });
  await createAuditLog({ actorId: session.user.id, action: "ACTIVITY_CREATED", entityType: "Activity", entityId: activity.id, newValue: { type: d.type } as never });
  return NextResponse.json(serializeBigInt(activity), { status: 201 });
}
