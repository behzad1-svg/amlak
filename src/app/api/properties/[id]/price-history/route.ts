// تاریخچه قیمت یک فایل — قیمت قبل و بعد هر تغییر، زمان و ثبت‌کننده.
// فقط کسی می‌خواند که خود فایل را می‌تواند ببیند (همان قانون GET فایل).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { hasRestrictedAccess } from "@/lib/access";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    select: { id: true, listedById: true, visibility: true, isOfficeFile: true, deletedAt: true },
  });
  if (!property || property.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  const canView =
    session.user.role === "OWNER" ||
    property.listedById === session.user.id ||
    property.isOfficeFile ||
    property.visibility === "TEAM_VISIBLE" ||
    (await hasRestrictedAccess(prisma as never, id, session.user.id));
  if (!canView) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const rows = await prisma.priceHistory.findMany({
    where: { propertyId: id },
    include: { changedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(serializeBigInt(rows));
}
