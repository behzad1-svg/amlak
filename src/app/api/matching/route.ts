// Live matches for the dropdown on the matching page: matched files for a
// customer, or matched customers for a property. Only entities the user
// can access are returned.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { findMatchesForCustomer, findMatchesForProperty, MatchBreakdownItem } from "@/lib/matching";
import { canAccessCustomer, canAccessPropertyFull, hasRestrictedAccess } from "@/lib/access";

type MatchItem = {
  id: string;
  kind: "Property" | "Customer";
  label: string;
  sub: string | null;
  score: number;
  reasons: string[];
  breakdown: MatchBreakdownItem[];
};

// Same view rule as properties/[id]: OWNER, lister, office file,
// TEAM_VISIBLE, or an explicit grant.
async function canViewProperty(
  user: { id: string; role: string },
  property: { id: string; listedById: string; visibility: string; isOfficeFile?: boolean }
) {
  if (canAccessPropertyFull(user, property)) return true;
  return hasRestrictedAccess(prisma as never, property.id, user.id);
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده\u200Cاید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");
  const propertyId = searchParams.get("propertyId");
  if ((customerId && propertyId) || (!customerId && !propertyId)) {
    return NextResponse.json({ error: "customerId یا propertyId لازم است" }, { status: 400 });
  }

  if (customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, assignedAgentId: true, deletedAt: true },
    });
    if (!customer || customer.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
    if (!canAccessCustomer(session.user, customer)) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
    const matches = await findMatchesForCustomer(customerId);
    const items: MatchItem[] = [];
    for (const m of matches) {
      const prop = m.property as
        | { id: string; title: string; region: string; listedById: string; visibility: string; isOfficeFile?: boolean }
        | undefined;
      if (!prop) continue;
      if (!(await canViewProperty(session.user, prop))) continue;
      items.push({ id: m.id, kind: "Property", label: prop.title, sub: prop.region, score: m.score, reasons: m.reasons, breakdown: m.breakdown });
    }
    return NextResponse.json({ matches: items });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId as string },
    select: { id: true, listedById: true, visibility: true, isOfficeFile: true, deletedAt: true },
  });
  if (!property || property.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!(await canViewProperty(session.user, property))) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const matches = await findMatchesForProperty(propertyId as string);
  const items: MatchItem[] = [];
  for (const m of matches) {
    const cust = m.customer as { id: string; name: string; assignedAgentId: string } | undefined;
    if (!cust) continue;
    if (!canAccessCustomer(session.user, cust)) continue;
    items.push({ id: m.id, kind: "Customer", label: cust.name, sub: null, score: m.score, reasons: m.reasons, breakdown: m.breakdown });
  }
  return NextResponse.json({ matches: items });
}
