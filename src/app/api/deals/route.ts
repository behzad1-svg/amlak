import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { dealCreateSchema } from "@/lib/validation";
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
  const where: Record<string, unknown> = {};
  if (session.user.role !== "OWNER") where.agentId = session.user.id;
  const deals = await prisma.deal.findMany({ where, include: { customer: { select: { id: true, name: true } }, property: { select: { id: true, title: true } }, agent: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(serializeBigInt(deals));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = dealCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  // گارد بین‌مشاوری برای معامله
  if (session.user.role !== "OWNER") {
    const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
    if (!customer || !canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    const propCheck = await prisma.property.findUnique({ where: { id: d.propertyId } });
    if (!propCheck || propCheck.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
    const canAccessProp = propCheck.listedById === session.user.id || propCheck.visibility === "TEAM_VISIBLE" || await hasRestrictedAccess(prisma as never, propCheck.id, session.user.id);
    if (!canAccessProp) return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
  }

  const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
  if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
  if (property.status !== "ACTIVE" && property.status !== "RESERVED") return NextResponse.json({ error: "این فایل قبلا معامله شده" }, { status: 409 });
  if (property.deletedAt) return NextResponse.json({ error: "فایل حذف شده" }, { status: 404 });

  // جلوگیری از معامله تکراری روی یک فایل/مشتری
  const existingDeal = await prisma.deal.findFirst({ where: { propertyId: d.propertyId } });
  if (existingDeal) return NextResponse.json({ error: "برای این فایل قبلا معامله ثبت شده" }, { status: 409 });
  const existingCustomerDeal = await prisma.deal.findFirst({ where: { customerId: d.customerId } });
  if (existingCustomerDeal) return NextResponse.json({ error: "برای این مشتری قبلا معامله ثبت شده" }, { status: 409 });

  const deal = await prisma.deal.create({
    data: {
      customerId: d.customerId,
      propertyId: d.propertyId,
      agentId: session.user.id,
      dealSalePriceToman: d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : null,
      dealDepositToman: d.dealDepositToman ? BigInt(d.dealDepositToman) : null,
      dealMonthlyRentToman: d.dealMonthlyRentToman ? BigInt(d.dealMonthlyRentToman) : null,
    },
  });

  // تکمیل چرخه: فایل به فروخته/اجاره‌رفته، مشتری به CONTRACT
  const newStatus = property.dealType === "SALE" ? "SOLD" : "RENTED";
  await prisma.property.update({ where: { id: d.propertyId }, data: { status: newStatus as never } });
  const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
  if (customer && customer.stage !== "CONTRACT" && customer.stage !== "LOST") {
    await prisma.customer.update({ where: { id: d.customerId }, data: { stage: "CONTRACT" as never, nextFollowUpAt: null } });
    await prisma.activity.create({ data: { type: "STAGE_CHANGE", agentId: session.user.id, customerId: d.customerId, oldValue: customer.stage, newValue: "CONTRACT" } });
  }

  await createAuditLog({ actorId: session.user.id, action: "DEAL_CREATED", entityType: "Deal", entityId: deal.id, newValue: { customerId: d.customerId, propertyId: d.propertyId } as never });
  await prisma.activity.create({ data: { type: "NOTE", agentId: session.user.id, customerId: d.customerId, propertyId: d.propertyId, description: `معامله ثبت شد` } });
  return NextResponse.json(serializeBigInt(deal), { status: 201 });
}
