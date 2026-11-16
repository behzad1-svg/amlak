import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { commissionSettleSchema } from "@/lib/validation";
import { serializeBigInt, formatToman } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { dealSplittable, resolveSplit } from "@/lib/shares";

/**
 * دریافت یا برگرداندن دریافت کمیسیون یک معامله — فقط مدیر.
 * PATCH /api/accounting/commissions/[id] { commissionPaid: boolean }
 * دکمه «دریافت شد» یعنی کمیسیون از مشتری دریافت شد: فقط پرچم commissionPaid
 * عوض می‌شود و به سهم‌ها دست نمی‌زند؛ با دریافت، مبلغ مبنای تقسیم (کمیسیون +
 * هر دو شیرینی منهای تخفیف) به‌عنوان ورودی خودکار در صندوق دفتر ثبت می‌شود و با برگرداندن
 * دریافت، آن ورودی حذف می‌شود. برگرداندن دریافت فقط وقتی مجاز است که هیچ
 * سهمی تسویه نشده باشد.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند کمیسیون را تسویه کند" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = commissionSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const deal = await prisma.deal.findUnique({
    where: { id },
    include: { shares: true, property: { select: { code: true, title: true } } },
  });
  if (!deal) return NextResponse.json({ error: "معامله یافت نشد" }, { status: 404 });
  const dealIncome = dealSplittable(deal);
  if (dealIncome <= BigInt(0)) {
    return NextResponse.json({ error: "برای این معامله کمیسیون یا شیرینی ثبت نشده است" }, { status: 400 });
  }

  const paid = parsed.data.commissionPaid;
  // برگرداندن دریافت فقط وقتی مجاز است که هیچ سهمی تسویه نشده باشد
  if (!paid && deal.shares.some((s) => s.settled)) {
    return NextResponse.json({ error: "اول تسویه سهم‌ها را برگردانید" }, { status: 400 });
  }

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    if (paid) {
      // ورودی خودکار صندوق — فقط اگر برای این معامله ورودی خودکار نیست
      const existing = await tx.cashboxEntry.findFirst({ where: { dealId: id, type: "IN" } });
      if (!existing) {
        await tx.cashboxEntry.create({
          data: {
            type: "IN",
            amount: dealIncome,
            title: `دریافت کمیسیون معامله ${deal.property.code ?? deal.property.title}`,
            note: `کمیسیون ${formatToman(deal.commissionToman ?? BigInt(0))} · شیرینی فروشنده ${formatToman(deal.sellerShiriniToman ?? BigInt(0))} · شیرینی خریدار ${formatToman(deal.buyerShiriniToman ?? BigInt(0))}${(deal.discountToman ?? BigInt(0)) > BigInt(0) ? ` · تخفیف ${formatToman(deal.discountToman)}` : ""}`,
            occurredAt: now,
            dealId: id,
            createdById: session.user.id,
          },
        });
      }
    } else {
      await tx.cashboxEntry.deleteMany({ where: { dealId: id, type: "IN" } });
    }
    return tx.deal.update({
      where: { id },
      data: {
        commissionPaid: paid,
        commissionPaidAt: paid ? now : null,
      },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        property: { select: { id: true, title: true, dealType: true, region: true } },
        agent: { select: { id: true, name: true } },
        shares: {
          select: { id: true, userId: true, name: true, pct: true, settled: true, settledAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  const split = resolveSplit(updated);
  const out = {
    ...updated,
    officePct: split.officePct,
    officeAmount: split.officeAmount,
    shares: split.shares,
  };

  await createAuditLog({
    actorId: session.user.id,
    action: paid ? "COMMISSION_SETTLED" : "COMMISSION_UNSETTLED",
    entityType: "Deal",
    entityId: id,
    newValue: { commissionPaid: paid } as never,
  });

  return NextResponse.json(serializeBigInt(out));
}
