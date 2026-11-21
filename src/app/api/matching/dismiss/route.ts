// رد کردن تطبیق («علاقه‌ای ندارد») یا لغو آن — داده پاک نمی‌شود،
// فقط تطبیق از لیست‌های تطبیق پنهان یا دوباره آشکار می‌شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { matchDismissSchema } from "@/lib/validation";
import { dismissMatch, undismissMatch } from "@/lib/matching";
import { canAccessCustomer, hasRestrictedAccess } from "@/lib/access";

async function canActOnPair(
  user: { id: string; role: string },
  customerId: string,
  propertyId: string
): Promise<boolean> {
  if (user.role === "OWNER") return true;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { assignedAgentId: true },
  });
  if (customer && canAccessCustomer(user, customer)) return true;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { listedById: true, visibility: true, isOfficeFile: true },
  });
  if (!property) return false;
  if (property.listedById === user.id) return true;
  if (property.isOfficeFile) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  return hasRestrictedAccess(prisma as never, propertyId, user.id);
}

async function checkPair(customerId: string, propertyId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, deletedAt: true },
  });
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, deletedAt: true },
  });
  if (!customer || customer.deletedAt || !property || property.deletedAt) return false;
  return true;
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = matchDismissSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { customerId, propertyId } = parsed.data;
  if (!(await checkPair(customerId, propertyId))) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }
  if (!(await canActOnPair(session.user, customerId, propertyId))) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }
  await dismissMatch(customerId, propertyId, session.user.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const propertyId = searchParams.get("propertyId");
  if (!customerId || !propertyId) {
    return NextResponse.json({ error: "customerId و propertyId لازم است" }, { status: 400 });
  }
  if (!(await checkPair(customerId, propertyId))) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }
  if (!(await canActOnPair(session.user, customerId, propertyId))) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }
  await undismissMatch(customerId, propertyId);
  return NextResponse.json({ ok: true });
}
