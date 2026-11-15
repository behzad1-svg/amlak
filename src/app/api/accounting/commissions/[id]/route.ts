import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { commissionSettleSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

/**
 * تسویه یا برگرداندن تسویه کمیسیون یک معامله — فقط مدیر.
 * PATCH /api/accounting/commissions/[id] { commissionPaid: boolean }
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

  const deal = await prisma.deal.findUnique({ where: { id } });
  if (!deal) return NextResponse.json({ error: "معامله یافت نشد" }, { status: 404 });
  if (deal.commissionToman == null) {
    return NextResponse.json({ error: "برای این معامله کمیسیونی ثبت نشده است" }, { status: 400 });
  }

  const paid = parsed.data.commissionPaid;
  const updated = await prisma.deal.update({
    where: { id },
    data: {
      commissionPaid: paid,
      commissionPaidAt: paid ? new Date() : null,
    },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, dealType: true, region: true } },
      agent: { select: { id: true, name: true } },
    },
  });

  await createAuditLog({
    actorId: session.user.id,
    action: paid ? "COMMISSION_SETTLED" : "COMMISSION_UNSETTLED",
    entityType: "Deal",
    entityId: id,
    newValue: { commissionPaid: paid } as never,
  });

  return NextResponse.json(serializeBigInt(updated));
}
