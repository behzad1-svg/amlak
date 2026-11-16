import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { shareSettleSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import { dealSplittable, shareAmount } from "@/lib/shares";

/**
 * تسویه یا برگرداندن تسویه یک سهم — فقط مدیر.
 * PATCH /api/accounting/shares/[id] { settled: boolean }
 * دکمه «تسویه» یعنی پرداخت سهم به مشاور/تعاون: سهم تسویه می‌شود و مبلغ همان
 * سهم به‌عنوان خروجی خودکار در صندوق دفتر ثبت می‌شود؛ با برگرداندن تسویه
 * سهم، آن خروجی حذف می‌شود. پرچم دریافت کلی معامله (commissionPaid) از روی
 * سهم‌ها همگام نمی‌شود — فقط با دکمه دریافت معامله عوض می‌شود.
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
          sellerShiriniToman: true,
          buyerShiriniToman: true,
          discountToman: true,
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
  const updated = await prisma.$transaction(async (tx) => {
    const s = await tx.dealShare.update({
      where: { id },
      data: { settled, settledAt: settled ? now : null },
    });
    if (settled) {
      // خروجی خودکار صندوق — فقط اگر برای این سهم خروجی خودکار نیست
      const existing = await tx.cashboxEntry.findFirst({ where: { shareId: id, type: "OUT" } });
      if (!existing) {
        await tx.cashboxEntry.create({
          data: {
            type: "OUT",
            amount: shareAmount(dealSplittable(share.deal), Number(share.pct)),
            title: `تسویه سهم ${share.name} — معامله ${share.deal.property.code ?? share.deal.property.title}`,
            shareId: id,
            occurredAt: now,
            createdById: session.user.id,
          },
        });
      }
    } else {
      await tx.cashboxEntry.deleteMany({ where: { shareId: id, type: "OUT" } });
    }
    const deal = await tx.deal.findUnique({ where: { id: share.dealId }, select: { commissionPaid: true } });
    return { share: s, dealCommissionPaid: deal?.commissionPaid ?? false };
  });

  await createAuditLog({
    actorId: session.user.id,
    action: settled ? "SHARE_SETTLED" : "SHARE_UNSETTLED",
    entityType: "DealShare",
    entityId: id,
    newValue: { settled, dealId: share.dealId } as never,
  });

  return NextResponse.json(serializeBigInt(updated));
}
