import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { propertyCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { runMatchingForProperty } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const region = searchParams.get("region");
  const type = searchParams.get("type");
  const dealType = searchParams.get("dealType");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = { deletedAt: null };
  if (region) where.region = region;
  if (type) where.type = type;
  if (dealType) where.dealType = dealType;
  if (status) where.status = status;
  if (search) where.title = { contains: search, mode: "insensitive" };

  // AGENT: only own + TEAM_VISIBLE, plus RESTRICTED with active access
  if (session.user.role !== "OWNER") {
    const accessibleIds = await prisma.propertyAccess.findMany({
      where: { userId: session.user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { propertyId: true },
    });
    const ids = accessibleIds.map((a) => a.propertyId);
    where.OR = [
      { listedById: session.user.id },
      { visibility: "TEAM_VISIBLE" },
      ...(ids.length ? [{ id: { in: ids } }] : []),
    ];
  }

  const properties = await prisma.property.findMany({
    where,
    include: { listedBy: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  // Mask RESTRICTED for non-owners without access
  let result = properties;
  if (session.user.role !== "OWNER") {
    const accessSet = new Set(
      (await prisma.propertyAccess.findMany({
        where: { userId: session.user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { propertyId: true },
      })).map((a) => a.propertyId)
    );
    result = properties.map((p) => {
      if (p.visibility === "RESTRICTED" && p.listedById !== session.user.id && !accessSet.has(p.id)) {
        const { address: _a, ...rest } = p as Record<string, unknown> as typeof p & { address: unknown };
        return rest as typeof p;
      }
      return p;
    });
  }

  return NextResponse.json(serializeBigInt(result));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json();
  const parsed = propertyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  // Validation: sale vs rent pricing
  if (d.dealType === "SALE" && !d.salePriceToman) return NextResponse.json({ error: "قیمت فروش الزامی است" }, { status: 400 });
  if (d.dealType === "RENT" && (!d.depositToman || !d.monthlyRentToman)) return NextResponse.json({ error: "رهن و اجاره الزامی است" }, { status: 400 });

  const property = await prisma.property.create({
    data: {
      title: d.title,
      type: d.type as never,
      dealType: d.dealType as never,
      salePriceToman: d.salePriceToman ? BigInt(d.salePriceToman) : null,
      depositToman: d.depositToman ? BigInt(d.depositToman) : null,
      monthlyRentToman: d.monthlyRentToman ? BigInt(d.monthlyRentToman) : null,
      status: (d.status as never) ?? "ACTIVE",
      sizeSqm: d.sizeSqm,
      beds: d.beds,
      builtYear: d.builtYear,
      floor: d.floor,
      totalFloors: d.totalFloors,
      hasParking: d.hasParking ?? false,
      hasStorage: d.hasStorage ?? false,
      region: d.region,
      address: d.address,
      ownerId: d.ownerId,
      listedById: session.user.id,
      visibility: (d.visibility as never) ?? "TEAM_VISIBLE",
      isAdvertised: d.isAdvertised ?? false,
      nextOwnerFollowUpAt: d.nextOwnerFollowUpAt ? new Date(d.nextOwnerFollowUpAt) : null,
    },
  });

  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_CREATED", entityType: "Property", entityId: property.id, newValue: { title: d.title } as never });
  await prisma.activity.create({ data: { type: "NOTE", agentId: session.user.id, propertyId: property.id, description: `فایل جدید: ${d.title}` } });

  try { await runMatchingForProperty(property.id, session.user.id); } catch {}

  return NextResponse.json(serializeBigInt(property), { status: 201 });
}
