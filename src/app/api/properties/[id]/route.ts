import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { propertyUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { hasRestrictedAccess, maskPropertyForTeam, syncPropertyAccess } from "@/lib/access";
import { deleteMatchNotificationsForSource, runMatchingForProperty } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";

async function canViewProperty(user: { id: string; role: string }, property: { listedById: string; visibility: string; id: string; isOfficeFile?: boolean }) {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  if (property.isOfficeFile) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  const hasAccess = await hasRestrictedAccess(prisma as never, property.id, user.id);
  return hasAccess;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id },
    include: {
      listedBy: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true, phone: true } },
      appraisedBy: { select: { id: true, name: true } },
      accessList: {
        where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { userId: true, user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!property) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (property.deletedAt) {
    const allowed = await canViewProperty(session.user, property);
    return NextResponse.json({ error: allowed ? "این فایل حذف شده است" : "یافت نشد" }, { status: 404 });
  }
  const allowed = await canViewProperty(session.user, property);
  if (!allowed) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  // RESTRICTED بدون دسترسی را قبلا canViewProperty رد کرده؛ اینجا فقط TEAM_VISIBLE دیگران را ماسک می‌کنیم —
  // مگر مشاوری که در فرم ثبت/ویرایش تیک خورده (دسترسی صریح دارد) که اطلاعات کامل را می‌بیند
  const hasGrant =
    session.user.role !== "OWNER" && property.listedById !== session.user.id
      ? await hasRestrictedAccess(prisma as never, property.id, session.user.id)
      : false;
  let result: unknown = property;
  if (
    session.user.role !== "OWNER" &&
    property.listedById !== session.user.id &&
    property.visibility === "TEAM_VISIBLE" &&
    !property.isOfficeFile &&
    !hasGrant
  ) {
    result = maskPropertyForTeam(property as unknown as Record<string, unknown>);
  }

  // لیست دسترسی کامل فقط برای مدیر و ثبت‌کننده فایل؛
  // برای مشاور دارای دسترسی (بدون ماسک) هم باید حذف شود، چون در کوئری خوانده شده
  if (session.user.role === "OWNER" || property.listedById === session.user.id) {
    (result as Record<string, unknown>).accessList = property.accessList;
  } else {
    delete (result as Record<string, unknown>).accessList;
  }

  // no-store صریح: پاسخ GET فایل نباید در CDN/مرورگر کش شود، وگرنه بعد از
  // ذخیره قیمت صفحه کهنه می‌ماند تا ریلود دستی (F4).
  return NextResponse.json(serializeBigInt(result), {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  // Only owner/lister can edit
  if (session.user.role !== "OWNER" && existing.listedById !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = propertyUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;

  // وضعیت فروخته/اجاره‌داده‌شده فقط از مسیر معامله می‌آید — مشاور نمی‌تواند مستقیم SOLD/RENTED بگذارد
  if (d.status !== undefined && (d.status === "SOLD" || d.status === "RENTED") && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "تغییر وضعیت به فروخته/اجاره‌داده‌شده فقط با ثبت معامله انجام می‌شود" }, { status: 403 });
  }

  // بایگانی و بازگردانی از بایگانی فقط با مجوز بایگانی (پیش‌فرض: مشاور دارد، مدیر همیشه)
  if (
    d.status !== undefined &&
    (d.status === "ARCHIVED" || existing.status === "ARCHIVED") &&
    !hasPermission(session.user, "canArchiveProperty")
  ) {
    return NextResponse.json({ error: "اجازه بایگانی یا بازگردانی فایل را ندارید" }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  if (d.title !== undefined) updateData.title = d.title;
  if (d.type !== undefined) updateData.type = d.type;
  if (d.dealType !== undefined) updateData.dealType = d.dealType;
  if (d.salePriceToman !== undefined) updateData.salePriceToman = d.salePriceToman ? BigInt(d.salePriceToman as string) : null;
  if (d.depositToman !== undefined) updateData.depositToman = d.depositToman ? BigInt(d.depositToman as string) : null;
  if (d.monthlyRentToman !== undefined) updateData.monthlyRentToman = d.monthlyRentToman ? BigInt(d.monthlyRentToman as string) : null;
  if (d.status !== undefined) updateData.status = d.status;
  if (d.source !== undefined) updateData.source = d.source ?? null;
  if (d.sizeSqm !== undefined) updateData.sizeSqm = d.sizeSqm;
  if (d.beds !== undefined) updateData.beds = d.beds;
  if (d.builtYear !== undefined) updateData.builtYear = d.builtYear;
  if (d.floor !== undefined) updateData.floor = d.floor;
  if (d.totalFloors !== undefined) updateData.totalFloors = d.totalFloors;
  const extra = d as Record<string, unknown>;
  if (extra.unitsPerFloor !== undefined) updateData.unitsPerFloor = extra.unitsPerFloor;
  if (extra.unitCount !== undefined) updateData.unitCount = extra.unitCount;
  if (extra.landSizeSqm !== undefined) updateData.landSizeSqm = extra.landSizeSqm;
  if (extra.passageWidth !== undefined) updateData.passageWidth = extra.passageWidth;
  if (extra.buildingFrontage !== undefined) updateData.buildingFrontage = extra.buildingFrontage;
  if (extra.buildingFloors !== undefined) updateData.buildingFloors = extra.buildingFloors;
  if (d.hasParking !== undefined) updateData.hasParking = d.hasParking;
  if (d.hasStorage !== undefined) updateData.hasStorage = d.hasStorage;
  if (extra.hasElevator !== undefined) updateData.hasElevator = extra.hasElevator;
  if (extra.hasTerrace !== undefined) updateData.hasTerrace = extra.hasTerrace;
  if (extra.hasRenovated !== undefined) updateData.hasRenovated = extra.hasRenovated;
  if (extra.isNewBuild !== undefined) updateData.isNewBuild = extra.isNewBuild;
  if (d.region !== undefined) updateData.region = d.region;
  if (d.address !== undefined) updateData.address = d.address;
  if (d.description !== undefined) updateData.description = d.description;
  if (d.ownerId !== undefined) {
    const owner = await prisma.customer.findUnique({ where: { id: d.ownerId } });
    if (!owner || owner.deletedAt) return NextResponse.json({ error: "مالک یافت نشد" }, { status: 400 });
    if (session.user.role !== "OWNER" && owner.assignedAgentId !== session.user.id) {
      return NextResponse.json({ error: "به این مشتری دسترسی ندارید" }, { status: 403 });
    }
    updateData.ownerId = d.ownerId;
  }
  if ((d as { listedById?: string }).listedById !== undefined) {
    if (session.user.role !== "OWNER") {
      return NextResponse.json({ error: "فقط مدیر می‌تواند مشاور فایل را عوض کند" }, { status: 403 });
    }
    const listedById = (d as { listedById?: string }).listedById;
    if (!listedById) return NextResponse.json({ error: "شناسه مشاور نامعتبر است" }, { status: 400 });
    const agent = await prisma.user.findUnique({ where: { id: listedById } });
    if (!agent || !agent.active) return NextResponse.json({ error: "مشاور معتبر نیست" }, { status: 400 });
    updateData.listedById = listedById;
  }
  if (d.visibility !== undefined) updateData.visibility = d.visibility;
  if (d.isOfficeFile !== undefined) updateData.isOfficeFile = d.isOfficeFile;
  if (d.isAdvertised !== undefined) updateData.isAdvertised = d.isAdvertised;
  if (d.nextOwnerFollowUpAt !== undefined) updateData.nextOwnerFollowUpAt = d.nextOwnerFollowUpAt ? new Date(d.nextOwnerFollowUpAt as string) : null;

  const property = await prisma.property.update({ where: { id }, data: updateData });

  // تاریخچه قیمت — هر تغییر قیمت فروش/رهن/اجاره با قیمت قبل و بعد ثبت می‌شود؛
  // قیمت معامله جدا می‌ماند و اینجا ثبت نمی‌شود.
  const priceFields = [
    { key: "salePriceToman", field: "SALE_PRICE" },
    { key: "depositToman", field: "DEPOSIT" },
    { key: "monthlyRentToman", field: "MONTHLY_RENT" },
  ] as const;
  const historyRows = [];
  for (const { key, field } of priceFields) {
    if (!(key in updateData)) continue;
    const oldVal = existing[key] as bigint | null;
    const newVal = updateData[key] as bigint | null;
    if (oldVal !== newVal) {
      historyRows.push({ propertyId: id, field, oldValue: oldVal, newValue: newVal, changedById: session.user.id });
    }
  }
  if (historyRows.length > 0) {
    await prisma.priceHistory.createMany({ data: historyRows });
  }

  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_UPDATED", entityType: "Property", entityId: id });

  // همگام‌سازی لیست تیک‌خورده مشاورها (از فرم ویرایش)
  if (d.accessUserIds !== undefined) {
    const { grantedIds } = await syncPropertyAccess(prisma as never, id, property.title, d.accessUserIds, session.user.id);
    for (const accessId of grantedIds) {
      await createAuditLog({ actorId: session.user.id, action: "ACCESS_GRANTED", entityType: "PropertyAccess", entityId: accessId });
    }
  }

  const matchingFields = ["region", "type", "dealType", "salePriceToman", "depositToman", "sizeSqm"];
  if (matchingFields.some((f) => f in d)) {
    try { await runMatchingForProperty(id, property.listedById); } catch (e) {
      console.error("[matching] runMatchingForProperty failed for", id, e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json(serializeBigInt(property));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  // حذف فایل فقط با مجوز حذف (پیش‌فرض فقط مدیر دارد)
  if (!hasPermission(session.user, "canDeleteProperty")) {
    return NextResponse.json({ error: "فقط مدیر می‌تواند فایل را حذف کند" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  await prisma.property.update({ where: { id }, data: { deletedAt: new Date() } });
  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_DELETED", entityType: "Property", entityId: id });
  try {
    await deleteMatchNotificationsForSource(prisma as never, "property", id);
  } catch (e) {
    console.error("[matching] deleteMatchNotificationsForSource failed for", id, e instanceof Error ? e.message : e);
  }
  return NextResponse.json({ ok: true });
}
