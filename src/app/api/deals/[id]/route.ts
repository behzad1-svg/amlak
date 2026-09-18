import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { dealUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, dealType: true, region: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  if (!deal) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && deal.agentId !== session.user.id) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }
  return NextResponse.json(serializeBigInt(deal));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.deal.findUnique({ where: { id }, include: { property: true, customer: true } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && existing.agentId !== session.user.id) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = dealUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;
  const nextStatus = d.status ?? existing.status;

  const data: Record<string, unknown> = {};
  if (d.contractAt !== undefined) data.contractAt = d.contractAt ? new Date(d.contractAt) : null;
  if (d.notes !== undefined) data.notes = d.notes;
  if (d.commissionToman !== undefined)
    data.commissionToman = d.commissionToman ? BigInt(d.commissionToman) : null;
  if (d.commissionPercent !== undefined) data.commissionPercent = d.commissionPercent;
  if (d.dealSalePriceToman !== undefined)
    data.dealSalePriceToman = d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : null;
  if (d.dealDepositToman !== undefined)
    data.dealDepositToman = d.dealDepositToman ? BigInt(d.dealDepositToman) : null;
  if (d.dealMonthlyRentToman !== undefined)
    data.dealMonthlyRentToman = d.dealMonthlyRentToman ? BigInt(d.dealMonthlyRentToman) : null;

  if (d.status) {
    data.status = d.status;
    if (d.status === "CANCELED") data.canceledAt = new Date();
    if (d.status !== "CANCELED") data.canceledAt = null;
  }

  const deal = await prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({ where: { id }, data });

    const prop = existing.property;
    const cust = existing.customer;

    if (nextStatus === "COMPLETED" && existing.status !== "COMPLETED") {
      const newStatus = prop.dealType === "SALE" ? "SOLD" : "RENTED";
      await tx.property.update({ where: { id: prop.id }, data: { status: newStatus as never } });
      if (cust.stage !== "CONTRACT" && cust.stage !== "WON" && cust.stage !== "LOST") {
        await tx.customer.update({
          where: { id: cust.id },
          data: { stage: "CONTRACT" as never, nextFollowUpAt: null },
        });
      }
    }

    if (nextStatus === "CANCELED" && (existing.status === "COMPLETED" || existing.status === "PENDING")) {
      // Free the property only if no other open/completed deal holds it
      const otherOpen = await tx.deal.findFirst({
        where: {
          propertyId: prop.id,
          id: { not: id },
          status: { in: ["PENDING", "COMPLETED"] },
        },
      });
      if (!otherOpen && (prop.status === "SOLD" || prop.status === "RENTED" || prop.status === "RESERVED")) {
        await tx.property.update({ where: { id: prop.id }, data: { status: "ACTIVE" as never } });
      }
    }

    return updated;
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "DEAL_UPDATED",
    entityType: "Deal",
    entityId: id,
    oldValue: { status: existing.status } as never,
    newValue: { status: nextStatus } as never,
  });

  return NextResponse.json(serializeBigInt(deal));
}
