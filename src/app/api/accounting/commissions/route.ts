import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

/**
 * فهرست کمیسیون‌ها — از روی معامله‌های ثبت‌شده.
 * GET /api/accounting/commissions?paid=all|paid|unpaid
 * مدیر: همه؛ مشاور: فقط معامله‌های خودش. لغوشده‌ها نمی‌آیند.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const isOwner = session.user.role === "OWNER";

  const paid = new URL(req.url).searchParams.get("paid") ?? "all";
  const where: Record<string, unknown> = {
    status: { not: "CANCELED" },
    commissionToman: { not: null },
  };
  if (!isOwner) where.agentId = session.user.id;
  if (paid === "paid") where.commissionPaid = true;
  else if (paid === "unpaid") where.commissionPaid = false;

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
