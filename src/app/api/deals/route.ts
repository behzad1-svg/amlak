import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { dealCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";

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
  const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
  if (!property) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
  // مبلغ دستی، جدا از قیمت فایل
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
  await prisma.activity.create({ data: { type: "NOTE", agentId: session.user.id, customerId: d.customerId, propertyId: d.propertyId, description: `معامله ثبت شد` } });
  return NextResponse.json(serializeBigInt(deal), { status: 201 });
}
