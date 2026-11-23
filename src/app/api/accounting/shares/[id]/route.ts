import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { shareSettleSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { dealSplittable, splitShareAmount } from "@/lib/shares";

/**
 * تسویه یا برگرداندن تسویه یک سهم — فقط مدیر.
 * PATCH /api/accounting/shares/[id] { settled: boolean }
 * دکمه «تسویه» یعنی پرداخت سهم به مشاور/تعاون: سهم تسویه می شود و مبلغ همان
 * سهم به عنوان خروجی خودکار در صندوق دفتر ثبت می شود؛ با برگرداندن تسویه
 * سهم، به جای حذف خروجی، یک رکورد معکوس IN با همان مبلغ ساخته می شود تا تاریخچه صندوق
 * حفظ شود. پرچم دریافت کلی معامله (commissionPaid) از روی
 * سهم ها همگام نمی شود — فقط با دکمه دریافت معامله عوض می شود.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند سهم را تسویه کند" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = shareSettleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const share = await prisma.dealShare.findUnique({
    where: { id },
    include: {
      deal: {
        select: {
          id: true,
          commissionToman: true,
          sellerCommissionToman: true,
          buyerCommissionToman: true,
          sellerShiriniToman: true,
          buyerShiriniToman: true,
          discountToman: true,
          sellerDiscountToman: true,
          buyerDiscountToman: true,
          commissionPaid: true,
          property: { select: { code: true, title: true } },
        },
      },
    },
  });
  if (!share) return NextResponse.json({ error: "سهم یافت نشد" }, { status: 404 });
  if (dealSplittable(share.deal) <= BigInt(0)) {
    return NextResponse.json({ error: "برای این معامله کمیسیون یا شیرینی ثبت نشده است" }, { status: 400 });
  }

  const settled = parsed.data.settled;
  const now = new Date();
  // مبلغ تسویه همان مبلغ حل‌شدهٔ سهم است — دو درصد جدا (کمیسیون و شیرینی)؛
  // درصد شیرینی خالی یعنی همان درصد کمیسیون (معامله‌های قدیمی همان مبلغ قبلی).
  const amount = splitShareAmount(
    share.deal,
    Number(share.pct),
    share.shiriniPct != null ? Number(share.shiriniPct) : null,
  ).amount;
  // P2002: دو درخواست هم زمان «تسویه» می توانند هر دو از findFirst عبور کنند؛
  // ایندکس یکتای جزئی روی OUT هر سهم، دومی را با 409 رد می کند.
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.dealShare.update({
      where: { id },
      data: { settled, settledAt: settled ? now : null },
    });
    if (settled) {
      // خروجی خودکار صندوق — فقط اگر برای این سهم خروجی فعالی نیست
      const existing = await tx.cashboxEntry.findFirst({ where: { shareId: id, type: "OUT" } });
      if (!existing) {
        await tx.cashboxEntry.create({
          data: {
            type: "OUT",
            amount,
            title: `تسویه سهم ${share.name} — معامله ${share.deal.property.code ?? share.deal.property.title}`,
            shareId: id,
            occurredAt: now,
            createdById: session.user.id,
          },
        });
      } else {
        // خروجی هست ولی برگردانده شده (رکورد معکوس IN دارد): با حذف رکورد معکوس،
        // همان خروجی اول دوباره فعال می شود. ایندکس یکتای جزئی فقط یک OUT برای هر
        // سهم قبول می کند، پس OUT تازه ساخته نمی شود؛ تاریخچه کامل در AuditLog می ماند.
        await tx.cashboxEntry.deleteMany({ where: { shareId: id, type: "IN" } });
      }
    } else {
      // برگرداندن تسویه: خروجی صندوق حذف نمی شود؛ رکورد معکوس IN با همان مبلغ
      // خروجی ساخته می شود تا تاریخچه حفظ شود. موجودی صندوق با groupBy روی کل جدول
      // حساب می شود (IN منهای OUT)، پس رکورد معکوس تراز را درست نگه می دارد.
      const existing = await tx.cashboxEntry.findFirst({ where: { shareId: id, type: "OUT" } });
      if (existing) {
        const alreadyReversed = await tx.cashboxEntry.findFirst({ where: { shareId: id, type: "IN" } });
        if (!alreadyReversed) {
          await tx.cashboxEntry.create({
            data: {
              type: "IN",
              amount: existing.amount,
              title: `برگرداندن تسویه سهم ${share.name} — معامله ${share.deal.property.code ?? share.deal.property.title}`,
              note: `رکورد معکوس برای برگرداندن تسویه سهم ${share.name} — معامله ${share.deal.property.code ?? share.deal.property.title}`,
              occurredAt: now,
              shareId: id,
              createdById: session.user.id,
            },
          });
        }
      }
    }
    const deal = await tx.deal.findUnique({ where: { id: share.dealId }, select: { commissionPaid: true } });
    await createAuditLog({
      actorId: session.user.id,
      action: settled ? "SHARE_SETTLED" : "SHARE_UNSETTLED",
      entityType: "DealShare",
      entityId: id,
      newValue: { settled, dealId: share.dealId, amount } as never,
      client: tx,
    });
    return { share: s, dealCommissionPaid: deal?.commissionPaid ?? false };
  }).catch((e: unknown) => {
    if ((e as { code?: string }).code === "P2002") return null;
    throw e;
  });
  if (updated === null) {
    return NextResponse.json({ error: "برای این سهم خروجی صندوق قبلاً ثبت شده است" }, { status: 409 });
  }

  return NextResponse.json(serializeBigInt(updated));
}
