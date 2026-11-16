import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { propertyCreateSchema, findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { maskPropertyForTeam, syncPropertyAccess } from "@/lib/access";
import { runMatchingForProperty } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { nextPropertyCode } from "@/lib/propertyCode";
import { persianSearchOr } from "@/lib/search";

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
  const source = searchParams.get("source");
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
  const landSizeMin = searchParams.get("landSizeMin");
  const landSizeMax = searchParams.get("landSizeMax");
  const listedById = searchParams.get("listedById");
  const sort = searchParams.get("sort") ?? "newest";
  const hasElevator = searchParams.get("hasElevator") === "true";
  const hasParking = searchParams.get("hasParking") === "true";
  const hasStorage = searchParams.get("hasStorage") === "true";
  const hasTerrace = searchParams.get("hasTerrace") === "true";
  const hasRenovated = searchParams.get("hasRenovated") === "true";
  const isNewBuild = searchParams.get("isNewBuild") === "true";
  const appraised = searchParams.get("appraised"); // true | false | ""

  const invalidParam = findInvalidQueryParam([
    { name: "page", value: searchParams.get("page") },
    { name: "limit", value: searchParams.get("limit") },
    { name: "priceMin", value: priceMin },
    { name: "priceMax", value: priceMax },
    { name: "rentMin", value: rentMin },
    { name: "rentMax", value: rentMax },
    { name: "sizeMin", value: sizeMin, number: true },
    { name: "sizeMax", value: sizeMax, number: true },
    { name: "bedsMin", value: bedsMin },
    { name: "bedsMax", value: bedsMax },
    { name: "landSizeMin", value: landSizeMin, number: true },
    { name: "landSizeMax", value: landSizeMax, number: true },
  ]);
  if (invalidParam) {
    return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  }

  if (!["newest", "priceAsc", "priceDesc", "sizeDesc"].includes(sort)) {
    return NextResponse.json({ error: "مقدار «sort» معتبر نیست" }, { status: 400 });
  }
  if (source && !["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "IN_PERSON", "ADVERTISEMENT", "OTHER", "FILE_FINDING"].includes(source)) {
    return NextResponse.json({ error: "مقدار «source» معتبر نیست" }, { status: 400 });
  }

  const and: Record<string, unknown>[] = [{ deletedAt: null }];
  if (region) and.push({ region });
  else if (regions.length > 0) and.push({ region: { in: regions } });
  if (type) and.push({ type });
  if (dealType) and.push({ dealType });
  if (status) and.push({ status });
  else and.push({ status: { not: "ARCHIVED" } }); // بایگانی‌شده‌ها در فهرست پیش‌فرض دیده نمی‌شوند
  if (source) and.push({ source });

  if (search) {
    // جستجوی فارسی با نیم‌فاصله: «سهمبندی» باید «سهم‌بندی» را هم پیدا کند
    and.push({ OR: persianSearchOr(["title", "code", "address", "region"], search) });
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
  if (landSizeMin || landSizeMax) {
    const land: Record<string, unknown> = {};
    if (landSizeMin) land.gte = parseFloat(landSizeMin);
    if (landSizeMax) land.lte = parseFloat(landSizeMax);
    and.push({ landSizeSqm: land });
  }
  if (listedById && session.user.role === "OWNER") and.push({ listedById });
  if (hasElevator) and.push({ hasElevator: true });
  if (hasParking) and.push({ hasParking: true });
  if (hasStorage) and.push({ hasStorage: true });
  if (hasTerrace) and.push({ hasTerrace: true });
  if (hasRenovated) and.push({ hasRenovated: true });
  if (isNewBuild) and.push({ isNewBuild: true });
  if (appraised === "true") and.push({ isAppraised: true });
  if (appraised === "false") and.push({ isAppraised: false });

  // AGENT: only own + TEAM_VISIBLE, plus RESTRICTED with active access
  // (شناسه فایل‌های دارای دسترسی صریح — برای ماسک‌نکردن در پایین هم لازم است)
  let grantedPropertyIds: string[] = [];
  if (session.user.role !== "OWNER") {
    const accessibleIds = await prisma.propertyAccess.findMany({
      where: { userId: session.user.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      select: { propertyId: true },
    });
    const ids = accessibleIds.map((a) => a.propertyId);
    grantedPropertyIds = ids;
    and.push({
      OR: [
        { listedById: session.user.id },
        { visibility: "TEAM_VISIBLE" },
        { isOfficeFile: true },
        ...(ids.length ? [{ id: { in: ids } }] : []),
      ],
    });
  }

  const where = { AND: and } as Record<string, unknown>;

  const [properties, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { listedBy: { select: { id: true, name: true } }, owner: { select: { id: true, name: true } }, appraisedBy: { select: { id: true, name: true } } },
      orderBy: (() => {
        const priceField = dealType === "RENT" ? "depositToman" : "salePriceToman";
        if (sort === "priceAsc") return [{ [priceField]: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] as never;
        if (sort === "priceDesc") return [{ [priceField]: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] as never;
        if (sort === "sizeDesc") return [{ sizeSqm: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }] as never;
        return { createdAt: "desc" };
      })(),
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);

  // برای مشاور غیرمالک: فایل TEAM_VISIBLE دیگران بدون آدرس/مالک (حریم خصوصی) —
  // مگر مشاوری که در فرم ثبت/ویرایش تیک خورده (دسترسی صریح دارد)
  let result: unknown = properties;
  if (session.user.role !== "OWNER") {
    const grantedIds = new Set(grantedPropertyIds);
    result = properties.map((p) => {
      if (p.listedById !== session.user.id && p.visibility === "TEAM_VISIBLE" && !grantedIds.has(p.id) && !p.isOfficeFile) {
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
  if (!hasPermission(session.user, "canCreateProperty")) {
    return NextResponse.json({ error: "اجازه ثبت فایل ندارید" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = propertyCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  // Validation: sale vs rent pricing
  if (d.dealType === "SALE" && !d.salePriceToman) return NextResponse.json({ error: "قیمت فروش الزامی است" }, { status: 400 });
  if (d.dealType === "RENT" && (!d.depositToman || !d.monthlyRentToman)) return NextResponse.json({ error: "رهن و اجاره الزامی است" }, { status: 400 });

  // مالک باید وجود داشته باشد؛ مشاور فقط می‌تواند فایل را به مشتری خودش وصل کند
  // (بدون این چک، ownerId نامعتبر → خطای ۵۰۰ دیتابیس، و مالکِ مشتریِ مشاور دیگر → نشت شماره مالک)
  const owner = await prisma.customer.findUnique({ where: { id: d.ownerId } });
  if (!owner || owner.deletedAt) return NextResponse.json({ error: "مالک یافت نشد" }, { status: 400 });
  if (session.user.role !== "OWNER" && owner.assignedAgentId !== session.user.id) {
    return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
  }

  // جلوگیری از ثبت دوبارهٔ همان فایل توسط مشاور دیگر — مدیر معاف است.
  // «همان فایل» یعنی: همان مالک + همان آدرس + همان متراژ/نوع/نوع معامله؛
  // اگر آدرس وارد نشده باشد، همان مالک + همان منطقه/نوع/نوع معامله/متراژ.
  // فایلی با متراژ یا مشخصات متفاوت، فایل دیگری است و ثبتش آزاد است.
  // (برای ثبت دو واحد یکسان، آدرس/واحد را کامل کنید تا از هم جدا شوند.)
  if (session.user.role !== "OWNER") {
    const normAddr = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
    const addr = normAddr(d.address);
    const size = d.sizeSqm ?? null;
    const candidates = await prisma.property.findMany({
      where: { ownerId: d.ownerId, deletedAt: null, status: { not: "ARCHIVED" } },
      select: { id: true, code: true, address: true, region: true, type: true, dealType: true, sizeSqm: true, listedBy: { select: { name: true } } },
    });
    const dup = candidates.find((p) => {
      if (addr) return normAddr(p.address) === addr && p.sizeSqm === size && p.type === d.type && p.dealType === d.dealType;
      return p.region === d.region && p.type === d.type && p.dealType === d.dealType && p.sizeSqm === size;
    });
    if (dup) {
      return NextResponse.json({ error: `این فایل قبلاً ثبت شده است (کد ${dup.code ?? ""}، ثبت‌کننده: ${dup.listedBy?.name ?? "—"})؛ اگر ملک دیگری است، آدرس یا مشخصات را کامل کنید.` }, { status: 409 });
    }
  }

  // وضعیت فروخته/اجاره‌داده‌شده فقط از مسیر معامله می‌آید — مشاور نمی‌تواند مستقیم SOLD/RENTED بسازد
  const status = session.user.role === "OWNER" ? ((d.status as never) ?? "ACTIVE") : "ACTIVE";

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
      status,
      source: (d.source as never) ?? null,
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
      description: d.description,
      ownerId: d.ownerId,
      listedById: session.user.id,
      visibility: (d.visibility as never) ?? "TEAM_VISIBLE",
      isOfficeFile: d.isOfficeFile ?? false,
      isAdvertised: d.isAdvertised ?? false,
      // تیک «از قبل کارشناسی شده» در فرم ثبت: ثبت‌کننده همان کارشناس است —
      // appraisedById ورودی مشتری نادیده گرفته می‌شود (فقط مدیر می‌تواند
      // کارشناسی را به نام دیگری ثبت کند، آن هم از مسیر /api/appraise)
      isAppraised: d.isAppraised === true,
      appraisedById: d.isAppraised === true ? session.user.id : null,
      appraisedAt: d.isAppraised === true ? new Date() : null,
      nextOwnerFollowUpAt: d.nextOwnerFollowUpAt ? new Date(d.nextOwnerFollowUpAt) : null,
    },
  });

  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_CREATED", entityType: "Property", entityId: property.id, newValue: { code: property.code, title: d.title } as never });
  await prisma.activity.create({ data: { type: "NOTE", agentId: session.user.id, propertyId: property.id, description: `فایل جدید ${property.code}: ${d.title}` } });

  // کارشناسیِ ثبت‌شده در فرم: Activity + Audit مثل مسیر /appraise، تا آمار مدیر آن را ببیند
  if (d.isAppraised === true) {
    await prisma.activity.create({ data: { type: "APPRAISAL", agentId: session.user.id, propertyId: property.id, description: `کارشناسی فایل ${property.code} انجام شد` } });
    await createAuditLog({ actorId: session.user.id, action: "PROPERTY_APPRAISED", entityType: "Property", entityId: property.id, newValue: { appraisedById: session.user.id } as never });
  }

  // مشاورهای تیک‌خورده در فرم ثبت: دسترسی کامل به فایل
  if (d.accessUserIds !== undefined) {
    const { grantedIds } = await syncPropertyAccess(prisma as never, property.id, d.title, d.accessUserIds, session.user.id);
    for (const accessId of grantedIds) {
      await createAuditLog({ actorId: session.user.id, action: "ACCESS_GRANTED", entityType: "PropertyAccess", entityId: accessId });
    }
  }

  try { await runMatchingForProperty(property.id, session.user.id); } catch (e) {
    console.error("[matching] runMatchingForProperty failed for", property.id, e instanceof Error ? e.message : e);
  }

  return NextResponse.json(serializeBigInt(property), { status: 201 });
}
