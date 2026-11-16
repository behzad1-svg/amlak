import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { dealCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

async function canAccessPropertyForAction(
  user: { id: string; role: string },
  property: { listedById: string; visibility: string; id: string; isOfficeFile?: boolean }
): Promise<boolean> {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  if (property.isOfficeFile) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  return hasRestrictedAccess(prisma as never, property.id, user.id);
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const customerId = searchParams.get("customerId");
  const propertyId = searchParams.get("propertyId");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (customerId) where.customerId = customerId;
  if (propertyId) where.propertyId = propertyId;
  if (session.user.role !== "OWNER") where.agentId = session.user.id;

  const deals = await prisma.deal.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, dealType: true, region: true } },
      agent: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(serializeBigInt(deals));
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (!hasPermission(session.user, "canCreateDeal")) {
    return NextResponse.json({ error: "اجازه ثبت معامله ندارید" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = dealCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // کمیسیون را فقط مدیر تعیین می‌کند — مشاور نمی‌تواند کمیسیون خودش را بنویسد
  const wantsCommission =
    Boolean(d.commissionToman) || (d.commissionPercent !== undefined && d.commissionPercent !== null);
  if (session.user.role !== "OWNER" && wantsCommission) {
    return NextResponse.json({ error: "کمیسیون را فقط مدیر تعیین می‌کند" }, { status: 403 });
  }

  const status = d.status ?? "PENDING";

  const customer = await prisma.customer.findUnique({ where: { id: d.customerId } });
  if (!customer || customer.deletedAt) {
    return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
  }
  const property = await prisma.property.findUnique({ where: { id: d.propertyId } });
  if (!property || property.deletedAt) {
    return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
  }

  if (session.user.role !== "OWNER") {
    if (!canAccessCustomer(session.user, customer)) {
      return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    }
    if (!(await canAccessPropertyForAction(session.user, property))) {
      return NextResponse.json({ error: "به این فایل دسترسی ندارید" }, { status: 403 });
    }
  }

  if (property.status === "SOLD" || property.status === "RENTED") {
    return NextResponse.json({ error: "این فایل قبلا معامله شده" }, { status: 409 });
  }

  // One open deal per property (PENDING or COMPLETED); customers may have many deals
  const openOnProperty = await prisma.deal.findFirst({
    where: {
      propertyId: d.propertyId,
      status: { in: ["PENDING", "COMPLETED"] },
    },
  });
  if (openOnProperty) {
    return NextResponse.json(
      { error: "برای این فایل معامله باز/قطعی وجود دارد. ابتدا آن را لغو کنید." },
      { status: 409 }
    );
  }

  const deal = await prisma.$transaction(async (tx) => {
    const created = await tx.deal.create({
      data: {
        customerId: d.customerId,
        propertyId: d.propertyId,
        // کمیسیون مال مشاورِ مشتری است، نه کسی که دکمه «موفق» را زده
        agentId: customer.assignedAgentId,
        status: status as never,
        contractAt: d.contractAt ? new Date(d.contractAt) : status === "COMPLETED" ? new Date() : null,
        notes: d.notes,
        commissionToman: session.user.role === "OWNER" && d.commissionToman ? BigInt(d.commissionToman) : null,
        commissionPercent: session.user.role === "OWNER" ? (d.commissionPercent ?? null) : null,
        dealSalePriceToman: d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : (property.salePriceToman ?? null),
        dealDepositToman: d.dealDepositToman ? BigInt(d.dealDepositToman) : (property.depositToman ?? null),
        dealMonthlyRentToman: d.dealMonthlyRentToman
          ? BigInt(d.dealMonthlyRentToman)
          : (property.monthlyRentToman ?? null),
      },
    });

    if (status === "COMPLETED") {
      const newStatus = property.dealType === "SALE" ? "SOLD" : "RENTED";
      await tx.property.update({ where: { id: property.id }, data: { status: newStatus as never } });

      // تکمیل معامله یعنی مشتری «موفق» شد — فقط مسیر معامله مرحله را WON می‌کند
      if (customer.stage !== "WON" && customer.stage !== "LOST") {
        await tx.customer.update({
          where: { id: customer.id },
          data: { stage: "WON" as never, nextFollowUpAt: null },
        });
      }
    }

    return created;
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "DEAL_CREATED",
    entityType: "Deal",
    entityId: deal.id,
    newValue: { customerId: d.customerId, propertyId: d.propertyId, status } as never,
  });
  await prisma.activity.create({
    data: {
      type: "NOTE",
      agentId: session.user.id,
      customerId: d.customerId,
      propertyId: d.propertyId,
      description: status === "COMPLETED" ? "معامله قطعی ثبت شد" : "معامله در جریان ثبت شد",
    },
  });

  return NextResponse.json(serializeBigInt(deal), { status: 201 });
}
