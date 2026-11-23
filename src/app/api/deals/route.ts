import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { dealCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { getTaxRatePct } from "@/lib/settings";
import { validateCommissionAmount } from "@/lib/shares";

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
  if (session.user.role !== "OWNER") {
    // بعد از انتقال مشتری، مشاور تازه‌منتقل‌شده هم معامله را می‌بیند؛
    // مشاورِ سهم‌دار هم معاملهٔ مشترک را می‌بیند (مالکیت معامله عوض نمی‌شود)
    where.OR = [
      { agentId: session.user.id },
      { customer: { assignedAgentId: session.user.id } },
      { shares: { some: { userId: session.user.id } } },
    ];
  }

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
  const hasSideCommission =
    Boolean(d.sellerCommissionToman) ||
    Boolean(d.buyerCommissionToman) ||
    (d.sellerCommissionPercent !== undefined && d.sellerCommissionPercent !== null) ||
    (d.buyerCommissionPercent !== undefined && d.buyerCommissionPercent !== null);
  const wantsCommission =
    Boolean(d.commissionToman) || (d.commissionPercent !== undefined && d.commissionPercent !== null) || hasSideCommission;
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

  // بررسی سریعِ پیش از تراکنش (مسیر رایج)؛ بررسی قطعی داخل تراکنش با قفل ردیف انجام می‌شود
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

  // مبلغ کمیسیون باید با درصد × قیمت معامله بخواند (فقط فروش؛ اجاره دستی است)؛
  // وگرنه معامله‌ای مثل F-0022 با ۱٪ و ۱۲۰م روی قیمت ۱۰ میلیاردی ساخته می‌شود
  if (session.user.role === "OWNER" && property.dealType === "SALE") {
    const effectivePrice = d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : property.salePriceToman;
    if (d.commissionToman && d.commissionPercent != null) {
      const commissionError = validateCommissionAmount(effectivePrice, d.commissionPercent, BigInt(d.commissionToman));
      if (commissionError) return NextResponse.json({ error: commissionError }, { status: 400 });
    }
    // دوطرفه: هر طرف جدا — مبلغ هر طرف با درصد همان طرف می‌خواند
    for (const [label, amount, percent] of [
      ["فروشنده", d.sellerCommissionToman, d.sellerCommissionPercent],
      ["خریدار", d.buyerCommissionToman, d.buyerCommissionPercent],
    ] as const) {
      if (amount && percent != null) {
        const sideError = validateCommissionAmount(effectivePrice, percent, BigInt(amount));
        if (sideError) return NextResponse.json({ error: `${label}: ${sideError}` }, { status: 400 });
      }
    }
  }

  // مهر نرخ مالیات در لحظه ثبت کمیسیون — تغییر نرخ جاری بعدا روی این معامله اثر ندارد
  // جمع قدیمی و مهر نرخ فقط از روی مبلغ‌های طرف‌ها مشتق می‌شوند؛ درصدِ بدون مبلغ کمیسیون نیست
  const hasSideAmounts = Boolean(d.sellerCommissionToman) || Boolean(d.buyerCommissionToman);
  const sideCommissionTotal =
    (d.sellerCommissionToman ? BigInt(d.sellerCommissionToman) : BigInt(0)) +
    (d.buyerCommissionToman ? BigInt(d.buyerCommissionToman) : BigInt(0));
  const hasCommission = session.user.role === "OWNER" && (Boolean(d.commissionToman) || hasSideAmounts);
  const taxRateSnapshot = hasCommission ? await getTaxRatePct() : null;

  let deal;
  try {
    deal = await prisma.$transaction(async (tx) => {
      // قفل ردیف ملک: دو درخواست هم‌زمان نمی‌توانند هر دو از بررسی عبور کنند؛
      // دومی تا پایان تراکنش اولی صبر می‌کند و بعد وضعیت قفل‌شده را می‌بیند.
      // (خواندن ساده داخل تراکنش زیر read-committed کافی نیست.)
      await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${d.propertyId} FOR UPDATE`;
      const lockedProperty = await tx.property.findUnique({ where: { id: d.propertyId } });
      if (!lockedProperty || lockedProperty.deletedAt) {
        throw new Error("DEAL_CONFLICT_PROPERTY_GONE");
      }
      if (lockedProperty.status === "SOLD" || lockedProperty.status === "RENTED") {
        throw new Error("DEAL_CONFLICT_SOLD");
      }
      const openInsideTx = await tx.deal.findFirst({
        where: {
          propertyId: d.propertyId,
          status: { in: ["PENDING", "COMPLETED"] },
        },
      });
      if (openInsideTx) {
        throw new Error("DEAL_CONFLICT_OPEN");
      }

      const created = await tx.deal.create({
        data: {
          customerId: d.customerId,
          propertyId: d.propertyId,
          // کمیسیون مال مشاورِ مشتری است، نه کسی که دکمه «موفق» را زده
          agentId: customer.assignedAgentId,
          status: status as never,
          contractAt: d.contractAt ? new Date(d.contractAt) : status === "COMPLETED" ? new Date() : null,
          notes: d.notes,
          // دوطرفه: طرف‌ها مرجع‌اند و جمع قدیمی از روی آن‌ها مشتق می‌شود؛ وگرنه مسیر قدیمی
          sellerCommissionToman:
            session.user.role === "OWNER" && d.sellerCommissionToman ? BigInt(d.sellerCommissionToman) : null,
          sellerCommissionPercent: session.user.role === "OWNER" ? (d.sellerCommissionPercent ?? null) : null,
          buyerCommissionToman:
            session.user.role === "OWNER" && d.buyerCommissionToman ? BigInt(d.buyerCommissionToman) : null,
          buyerCommissionPercent: session.user.role === "OWNER" ? (d.buyerCommissionPercent ?? null) : null,
          commissionToman:
            session.user.role === "OWNER"
              ? hasSideAmounts
                ? sideCommissionTotal
                : d.commissionToman
                  ? BigInt(d.commissionToman)
                  : null
              : null,
          commissionPercent:
            session.user.role === "OWNER"
              ? hasSideCommission
                ? d.sellerCommissionPercent != null && d.sellerCommissionPercent === d.buyerCommissionPercent
                  ? d.sellerCommissionPercent
                  : (d.sellerCommissionPercent ?? d.buyerCommissionPercent ?? null)
                : (d.commissionPercent ?? null)
              : null,
          taxRatePct: taxRateSnapshot,
          dealSalePriceToman: d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : (lockedProperty.salePriceToman ?? null),
          dealDepositToman: d.dealDepositToman ? BigInt(d.dealDepositToman) : (lockedProperty.depositToman ?? null),
          dealMonthlyRentToman: d.dealMonthlyRentToman
            ? BigInt(d.dealMonthlyRentToman)
            : (lockedProperty.monthlyRentToman ?? null),
        },
      });

      if (status === "COMPLETED") {
        const newStatus = lockedProperty.dealType === "SALE" ? "SOLD" : "RENTED";
        await tx.property.update({ where: { id: lockedProperty.id }, data: { status: newStatus as never } });

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
  } catch (e) {
    if (e instanceof Error && e.message === "DEAL_CONFLICT_SOLD") {
      return NextResponse.json({ error: "این فایل قبلا معامله شده" }, { status: 409 });
    }
    if (e instanceof Error && e.message === "DEAL_CONFLICT_OPEN") {
      return NextResponse.json(
        { error: "برای این فایل معامله باز/قطعی وجود دارد. ابتدا آن را لغو کنید." },
        { status: 409 }
      );
    }
    if (e instanceof Error && e.message === "DEAL_CONFLICT_PROPERTY_GONE") {
      return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });
    }
    throw e;
  }

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
