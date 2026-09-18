import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { propertyUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { hasRestrictedAccess, maskPropertyForTeam } from "@/lib/access";
import { runMatchingForProperty } from "@/lib/matching";
import { createAuditLog } from "@/lib/audit";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

async function canViewProperty(user: { id: string; role: string }, property: { listedById: string; visibility: string; id: string }) {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  const hasAccess = await hasRestrictedAccess(prisma as never, property.id, user.id);
  return hasAccess;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id }, include: { listedBy: { select: { id: true, name: true } }, owner: { select: { id: true, name: true, phone: true } } } });
  if (!property || property.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  const allowed = await canViewProperty(session.user, property);
  if (!allowed) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  // RESTRICTED بدون دسترسی را قبلا canViewProperty رد کرده؛ اینجا فقط TEAM_VISIBLE دیگران را ماسک می‌کنیم
  let result: unknown = property;
  if (session.user.role !== "OWNER" && property.listedById !== session.user.id && property.visibility === "TEAM_VISIBLE") {
    result = maskPropertyForTeam(property as unknown as Record<string, unknown>);
  }

  return NextResponse.json(serializeBigInt(result));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  // Only owner/lister can edit
  if (session.user.role !== "OWNER" && existing.listedById !== session.user.id) return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });

  const body = await req.json();
  const parsed = propertyUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  const updateData: Record<string, unknown> = {};
  if (d.title !== undefined) updateData.title = d.title;
  if (d.type !== undefined) updateData.type = d.type;
  if (d.dealType !== undefined) updateData.dealType = d.dealType;
  if (d.salePriceToman !== undefined) updateData.salePriceToman = d.salePriceToman ? BigInt(d.salePriceToman as string) : null;
  if (d.depositToman !== undefined) updateData.depositToman = d.depositToman ? BigInt(d.depositToman as string) : null;
  if (d.monthlyRentToman !== undefined) updateData.monthlyRentToman = d.monthlyRentToman ? BigInt(d.monthlyRentToman as string) : null;
  if (d.status !== undefined) updateData.status = d.status;
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
  if (d.ownerId !== undefined) updateData.ownerId = d.ownerId;
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
  if (d.isAdvertised !== undefined) updateData.isAdvertised = d.isAdvertised;
  if (d.nextOwnerFollowUpAt !== undefined) updateData.nextOwnerFollowUpAt = d.nextOwnerFollowUpAt ? new Date(d.nextOwnerFollowUpAt as string) : null;

  const property = await prisma.property.update({ where: { id }, data: updateData });
  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_UPDATED", entityType: "Property", entityId: id });

  const matchingFields = ["region", "type", "dealType", "salePriceToman", "depositToman", "sizeSqm"];
  if (matchingFields.some((f) => f in d)) {
    try { await runMatchingForProperty(id, property.listedById); } catch {}
  }

  return NextResponse.json(serializeBigInt(property));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  // فقط مدیر می‌تواند فایل را حذف کند
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند فایل را حذف کند" }, { status: 403 });
  }
  const { id } = await params;
  const existing = await prisma.property.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  await prisma.property.update({ where: { id }, data: { deletedAt: new Date() } });
  await createAuditLog({ actorId: session.user.id, action: "PROPERTY_DELETED", entityType: "Property", entityId: id });
  return NextResponse.json({ ok: true });
}
