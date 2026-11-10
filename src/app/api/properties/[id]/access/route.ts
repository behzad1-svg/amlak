import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { propertyAccessCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  if (session.user.role !== "OWNER") return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  const list = await prisma.propertyAccess.findMany({
    where: { propertyId: id },
    include: { user: { select: { id: true, name: true } }, grantedBy: { select: { id: true, name: true } } },
    orderBy: { grantedAt: "desc" },
  });
  return NextResponse.json(serializeBigInt(list));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id: propertyId } = await params;
  const prop = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!prop || prop.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && prop.listedById !== session.user.id) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = propertyAccessCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const target = await prisma.user.findUnique({ where: { id: d.userId } });
  if (!target || !target.active) {
    return NextResponse.json({ error: "کاربر معتبر نیست" }, { status: 400 });
  }

  // @@unique([propertyId, userId]) — one row per pair; re-grant reactivates/updates
  const access = await prisma.propertyAccess.upsert({
    where: { propertyId_userId: { propertyId, userId: d.userId } },
    update: {
      reason: d.reason,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      grantedById: session.user.id,
      grantedAt: new Date(),
      revokedAt: null,
    },
    create: {
      propertyId,
      userId: d.userId,
      grantedById: session.user.id,
      reason: d.reason,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
    },
  });

  await prisma.notification.create({
    data: {
      userId: d.userId,
      type: "ACCESS_GRANTED",
      priority: "NORMAL",
      relatedType: "Property",
      relatedId: propertyId,
      message: `دسترسی به فایل "${prop.title}" به شما داده شد.`,
    },
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "ACCESS_GRANTED",
    entityType: "PropertyAccess",
    entityId: access.id,
  });

  return NextResponse.json(serializeBigInt(access), { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id: propertyId } = await params;
  const { searchParams } = new URL(req.url);
  const accessId = searchParams.get("accessId");
  const userId = searchParams.get("userId");

  let access = null;
  if (accessId) {
    access = await prisma.propertyAccess.findUnique({ where: { id: accessId } });
  } else if (userId) {
    access = await prisma.propertyAccess.findUnique({
      where: { propertyId_userId: { propertyId, userId } },
    });
  } else {
    return NextResponse.json({ error: "accessId یا userId الزامی است" }, { status: 400 });
  }

  if (!access || access.propertyId !== propertyId) {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }
  if (session.user.role !== "OWNER" && access.grantedById !== session.user.id) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  await prisma.propertyAccess.update({
    where: { id: access.id },
    data: { revokedAt: new Date() },
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "ACCESS_REVOKED",
    entityType: "PropertyAccess",
    entityId: access.id,
  });
  return NextResponse.json({ ok: true });
}
