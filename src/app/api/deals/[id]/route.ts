import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { dealUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

// ماشین وضعیت معامله — CANCELED ترمینال است و برنمی‌گردد؛
// COMPLETED فقط از PENDING می‌آید؛ COMPLETED می‌تواند لغو شود.
// (تغییر وضعیت با همان مقدار فعلی، no-op است و مجاز می‌ماند.)
const ALLOWED_DEAL_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PENDING", "COMPLETED", "CANCELED"],
  COMPLETED: ["COMPLETED", "CANCELED"],
  CANCELED: ["CANCELED"],
};

const DEAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  COMPLETED: "تکمیل‌شده",
  CANCELED: "لغوشده",
};

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

  // کمیسیون را فقط مدیر تعیین می‌کند
  const wantsCommission =
    Boolean(d.commissionToman) || (d.commissionPercent !== undefined && d.commissionPercent !== null);
  if (session.user.role !== "OWNER" && wantsCommission) {
    return NextResponse.json({ error: "کمیسیون را فقط مدیر تعیین می‌کند" }, { status: 403 });
  }

  // پس از تسویه، قیمت/کمیسیون قفل است — اول باید تسویه برگردد؛ تغییر وضعیت (لغو) از این قفل مستثناست
  const wantsMoneyChange =
    d.dealSalePriceToman !== undefined ||
    d.dealDepositToman !== undefined ||
    d.dealMonthlyRentToman !== undefined ||
    d.commissionToman !== undefined ||
    d.commissionPercent !== undefined;
  if (existing.commissionPaid && wantsMoneyChange) {
    return NextResponse.json(
      { error: "این معامله تسویه شده است؛ برای تغییر قیمت یا کمیسیون اول تسویه را برگردانید" },
      { status: 400 }
    );
  }

  // معامله تکمیل‌شده برای مشاور قفل است — فقط لغو مجاز است، نه تغییر مبلغ/کمیسیون/تاریخ
  if (existing.status === "COMPLETED" && session.user.role !== "OWNER") {
    const onlyCancel =
      d.status === "CANCELED" &&
      d.contractAt === undefined &&
      d.notes === undefined &&
      d.dealSalePriceToman === undefined &&
      d.dealDepositToman === undefined &&
      d.dealMonthlyRentToman === undefined;
    if (!onlyCancel) {
      return NextResponse.json(
        { error: "معامله تکمیل‌شده فقط توسط مدیر قابل ویرایش است؛ مشاور فقط می‌تواند آن را لغو کند" },
        { status: 403 }
      );
    }
  }

  const nextStatus = d.status ?? existing.status;

  // گارد ماشین وضعیت: انتقال غیرمجاز رد می‌شود (۴۰۹)
  if (d.status && d.status !== existing.status) {
    const allowed = ALLOWED_DEAL_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(d.status)) {
      return NextResponse.json(
        {
          error: `تغییر وضعیت معامله از «${DEAL_STATUS_LABELS[existing.status] ?? existing.status}» به «${DEAL_STATUS_LABELS[d.status] ?? d.status}» مجاز نیست`,
        },
        { status: 409 },
      );
    }
  }

  // قبل از تکمیل، دوباره چک کن معامله باز دیگری روی همین فایل نباشد
  if (nextStatus === "COMPLETED" && existing.status !== "COMPLETED") {
    const otherOpen = await prisma.deal.findFirst({
      where: {
        propertyId: existing.propertyId,
        id: { not: id },
        status: { in: ["PENDING", "COMPLETED"] },
      },
    });
    if (otherOpen) {
      return NextResponse.json({ error: "معامله باز دیگری روی این فایل وجود دارد" }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = {};
  if (d.contractAt !== undefined) data.contractAt = d.contractAt ? new Date(d.contractAt) : null;
  if (d.notes !== undefined) data.notes = d.notes;
  if (session.user.role === "OWNER") {
    if (d.commissionToman !== undefined)
      data.commissionToman = d.commissionToman ? BigInt(d.commissionToman) : null;
    if (d.commissionPercent !== undefined) data.commissionPercent = d.commissionPercent;
  }
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
      // تکمیل معامله یعنی مشتری «موفق» شد — فقط مسیر معامله مرحله را WON می‌کند
      if (cust.stage !== "WON" && cust.stage !== "LOST") {
        await tx.customer.update({
          where: { id: cust.id },
          data: { stage: "WON" as never, nextFollowUpAt: null },
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
