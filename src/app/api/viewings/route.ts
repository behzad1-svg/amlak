import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { viewingCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer } from "@/lib/access";
import { hasRestrictedAccess } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

async function canAccessPropertyForAction(
  user: { id: string; role: string },
  property: { listedById: string; visibility: string; id: string }
): Promise<boolean> {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  return hasRestrictedAccess(prisma as never, property.id, user.id);
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

  // مشاور فقط بازدیدهای خودش؛ مدیر (یا ثبت‌کننده فایل) همه بازدیدهای آن فایل را می‌بیند
  if (session.user.role !== "OWNER") {
    if (propertyId) {
      const prop = await prisma.property.findUnique({ where: { id: propertyId }, select: { listedById: true } });
      if (!prop || prop.listedById !== session.user.id) {
        where.agentId = session.user.id;
      }
    } else {
      where.agentId = session.user.id;
    }
  }

  const viewings = await prisma.viewing.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true } },
      property: { select: { id: true, title: true, code: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { startAt: "desc" },
  });
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

  // نسبت دادن بازدید به مشاور — فقط مدیر
  let agentId = session.user.id;
  if (d.agentId && d.agentId !== session.user.id) {
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "فقط مدیر می‌تواند بازدید را به مشاور دیگر نسبت دهد" }, { status: 403 });
    }
    const agent = await prisma.user.findUnique({ where: { id: d.agentId } });
    if (!agent || !agent.active) return NextResponse.json({ error: "مشاور معتبر نیست" }, { status: 400 });
    agentId = agent.id;
  }

  // گارد بین‌مشاوری
  if (session.user.role !== "OWNER") {
    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer || !canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
    if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
    const canAccessProp = await canAccessPropertyForAction(session.user, property);
    if (!canAccessProp) return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
  }

  const viewing = await prisma.viewing.create({
    data: {
      customerId: d.customerId,
      propertyId: d.propertyId,
      agentId,
      startAt: new Date(d.startAt),
      endAt: d.endAt ? new Date(d.endAt) : null,
      status: (d.status as never) ?? "SCHEDULED",
      feedback: d.feedback,
    },
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "VIEWING_CREATED",
    entityType: "Viewing",
    entityId: viewing.id,
    newValue: { customerId: d.customerId, propertyId: d.propertyId, agentId } as never,
  });
  // یادداشت در پرونده فایل + مشتری تا فعالیت مشاور دیده شود
  const statusLabel = viewing.status === "DONE" ? "بازدید انجام شد" : "بازدید ثبت شد";
  await prisma.activity.create({
    data: {
      type: viewing.status === "DONE" ? "VIEWING_DONE" : "NOTE",
      agentId,
      customerId: d.customerId,
      propertyId: d.propertyId,
      description: d.feedback ? `${statusLabel}: ${d.feedback}` : statusLabel,
    },
  });
  return NextResponse.json(serializeBigInt(viewing), { status: 201 });
}
