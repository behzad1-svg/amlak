import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { propertyCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { maskPropertyForTeam } from "@/lib/access";
import { runMatchingForProperty } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";
import { nextPropertyCode } from "@/lib/propertyCode";

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
  const regions = searchParams.getAll("regions").flatMap((r) => r.split(",")).map((r) => r.trim()).filter(Boolean);
  const type = searchParams.get("type");
  const dealType = searchParams.get("dealType");
  const status = searchParams.get("status");
  const search = searchParams.get("search");

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "100")));
  const priceMin = searchParams.get("priceMin");
  const priceMax = searchParams.get("priceMax");
  const rentMin = searchParams.get("rentMin");
  const rentMax = searchParams.get("rentMax");
  const sizeMin = searchParams.get("sizeMin");
  const sizeMax = searchParams.get("sizeMax");
  const bedsMin = searchParams.get("bedsMin");
  const bedsMax = searchParams.get("bedsMax");
  const hasElevator = searchParams.get("hasElevator") === "true";
  const hasParking = searchParams.get("hasParking") === "true";
  const hasStorage = searchParams.get("hasStorage") === "true";
  const hasTerrace = searchParams.get("hasTerrace") === "true";
  const hasRenovated = searchParams.get("hasRenovated") === "true";
  const isNewBuild = searchParams.get("isNewBuild") === "true";
  const appraised = searchParams.get("appraised"); // true | false | ""

  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (region) and.push({ region });
  else if (regions.length > 0) and.push({ region: { in: regions } });
  if (type) and.push({ type });
  if (dealType) and.push({ dealType });
  if (status) and.push({ status });

  if (search) {
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
        { region: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  // قیمت: فروش = salePrice؛ رهن = deposit (+ اجاره ماهانه اختیاری)؛ بدون نوع معامله = هر دو
  const salePrice: Record<string, unknown> = {};
  if (priceMin) salePrice.gte = BigInt(priceMin);
  if (priceMax) salePrice.lte = BigInt(priceMax);
  const depositPrice: Record<string, unknown> = {};
  if (priceMin) depositPrice.gte = BigInt(priceMin);
  if (priceMax) depositPrice.lte = BigInt(priceMax);
  const monthlyPrice: Record<string, unknown> = {};
  if (rentMin) monthlyPrice.gte = BigInt(rentMin);
  if (rentMax) monthlyPrice.lte = BigInt(rentMax);

  if (priceMin || priceMax) {
    if (dealType === "SALE") {
      and.push({ salePriceToman: salePrice });
    } else if (dealType === "RENT") {
      and.push({ depositToman: depositPrice });
    } else {
      and.push({
        OR: [
          { salePriceToman: salePrice },
          { depositToman: depositPrice },
        ],
      });
    }
  }
  if (rentMin || rentMax) {
    and.push({ monthlyRentToman: monthlyPrice });
  }

  if (sizeMin || sizeMax) {
    const size: Record<string, unknown> = {};
    if (sizeMin) size.gte = parseFloat(sizeMin);
    if (sizeMax) size.lte = parseFloat(sizeMax);
    and.push({ sizeSqm: size });
  }
  if (bedsMin || bedsMax) {
    const beds: Record<string, unknown> = {};
    if (bedsMin) beds.gte = parseInt(bedsMin, 10);
    if (bedsMax) beds.lte = parseInt(bedsMax, 10);
    and.push({ beds });
  }
  if (hasElevator) and.push({ hasElevator: true });
  if (hasParking) and.push({ hasParking: true });
  if (hasStorage) and.push({ hasStorage: true });
  if (hasTerrace) and.push({ hasTerrace: true });
  if (hasRenovated) and.push({ hasRenovated: true });
  if (isNewBuild) and.push({ isNewBuild: true });
  if (appraised === "true") and.push({ isAppraised: true });
  if (appraised === "false") and.push({ isAppraised: false });

  // AGENT: only own + TEAM_VISIBLE, plus RESTRICTED with active access
  if (session.user.role !== "OWNER") {
    const accessibleIds = await prisma.propertyAccess.findMany({
      where: { userId: session.user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { propertyId: true },
    });
    const ids = accessibleIds.map((a) => a.propertyId);
    and.push({
      OR: [
        { listedById: session.user.id },
        { visibility: "TEAM_VISIBLE" },
        ...(ids.length ? [{ id: { in: ids } }] : []),
      ],
    });
  }

  const where = { AND: and } as Record<string, unknown>;

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { listedBy: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } }, appraisedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);

  // برای مشاور غیرمالک: فایل TEAM_VISIBLE دیگران بدون آدرس/مالک (حریم خصوصی)
  let result: unknown = properties;
  if (session.user.role !== "OWNER") {
    result = properties.map((p) => {
      if (p.listedById !== session.user.id && p.visibility === "TEAM_VISIBLE") {
        return maskPropertyForTeam(p as unknown as Record<string, unknown>);
      }
      return p;
    });
  }

  const isDefaultPage = !searchParams.has("page") && !searchParams.has("limit") && !searchParams.has("regions");
  if (isDefaultPage && !regions.length && !priceMin && !priceMax && !sizeMin && !sizeMax) {
    return NextResponse.json(serializeBigInt(result));
  }
  return NextResponse.json({ ...serializeBigInt({ properties: result }), total, page, limit });
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

  // کد فایل همیشه خودکار — ورودی دستی پذیرفته نمی‌شود
  const code = await nextPropertyCode();

  const property = await prisma.property.create({
    data: {
      code,
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
      unitsPerFloor: (d as { unitsPerFloor?: number | null }).unitsPerFloor ?? null,
      unitCount: (d as { unitCount?: number | null }).unitCount ?? null,
      landSizeSqm: (d as { landSizeSqm?: number | null }).landSizeSqm ?? null,
      passageWidth: (d as { passageWidth?: number | null }).passageWidth ?? null,
      buildingFrontage: (d as { buildingFrontage?: number | null }).buildingFrontage ?? null,
      buildingFloors: (d as { buildingFloors?: number | null }).buildingFloors ?? null,
      hasParking: d.hasParking ?? false,
      hasStorage: d.hasStorage ?? false,
      hasElevator: (d as { hasElevator?: boolean }).hasElevator ?? false,
      hasTerrace: (d as { hasTerrace?: boolean }).hasTerrace ?? false,
      hasRenovated: (d as { hasRenovated?: boolean }).hasRenovated ?? false,
      isNewBuild: (d as { isNewBuild?: boolean }).isNewBuild ?? false,
      region: d.region,
      address: d.address,
      ownerId: d.ownerId,
      listedById: session.user.id,
      visibility: (d.visibility as never) ?? "TEAM_VISIBLE",
      isAdvertised: d.isAdvertised ?? false,
      isAppraised: (d as { isAppraised?: boolean }).isAppraised ?? false,
      appraisedById: (d as { isAppraised?: boolean }).isAppraised ? session.user.id : null,
      appraisedAt: (d as { isAppraised?: boolean }).isAppraised ? new Date() : null,
      nextOwnerFollowUpAt: d.nextOwnerFollowUpAt ? new Date(d.nextOwnerFollowUpAt) : null,
    },
  });

  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_CREATED", entityType: "Property", entityId: property.id, newValue: { code: property.code, title: d.title } as never });
  await prisma.activity.create({ data: { type: "NOTE", agentId: session.user.id, propertyId: property.id, description: `فایل جدید ${property.code}: ${d.title}` } });

  try { await runMatchingForProperty(property.id, session.user.id); } catch {}

  return NextResponse.json(serializeBigInt(property), { status: 201 });
}
