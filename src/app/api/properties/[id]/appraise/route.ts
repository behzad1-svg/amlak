import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

/** سوییچ کارشناسی فایل — ثبت مشاور + زمان + Activity برای آمار مدیر */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const appraised = body?.appraised !== false;
  // مدیر می‌تواند کارشناسی را به نام مشاور دیگر ثبت/اصلاح کند
  let agentId = session.user.id;
  if (body?.agentId && session.user.role === "OWNER") {
    const agent = await prisma.user.findUnique({ where: { id: body.agentId } });
    if (!agent || !agent.active) return NextResponse.json({ error: "مشاور معتبر نیست" }, { status: 400 });
    agentId = agent.id;
  } else if (body?.agentId && body.agentId !== session.user.id && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند کارشناسی را به نام دیگری ثبت کند" }, { status: 403 });
  }

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });

  if (session.user.role !== "OWNER" && property.listedById !== session.user.id && property.visibility !== "TEAM_VISIBLE") {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  // مشاور فقط می‌تواند تیک بزند؛ برداشتن/تغییر فقط مدیر
  if (!appraised && property.isAppraised && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند تیک کارشناسی را بردارد یا تغییر دهد" }, { status: 403 });
  }
  if (appraised && property.isAppraised && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "این فایل قبلاً کارشناسی شده — فقط مدیر می‌تواند تغییر دهد" }, { status: 403 });
  }

  const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

  if (appraised) {
    const updated = await prisma.property.update({
      where: { id },
      data: {
        isAppraised: true,
        appraisedById: agentId,
        appraisedAt: new Date(),
      },
      include: {
        appraisedBy: { select: { id: true, name: true } },
        listedBy: { select: { id: true, name: true } },
      },
    });
    await prisma.activity.create({
      data: {
        type: "APPRAISAL",
        agentId,
        propertyId: id,
        description: note
          ? `کارشناسی فایل ${property.code ?? ""}: ${note}`
          : `کارشناسی فایل ${property.code ?? property.title} انجام شد`,
      },
    });
    await createAuditLog({
      actorId: session.user.id,
      action: "PROPERTY_APPRAISED",
      entityType: "Property",
      entityId: id,
      newValue: { appraisedById: agentId } as never,
    });
    return NextResponse.json(serializeBigInt(updated));
  }

  // برداشتن تیک کارشناسی — Activity قبلی حذف نمی‌شود (لاگ کار باقی بماند)
  const cleared = await prisma.property.update({
    where: { id },
    data: { isAppraised: false, appraisedById: null, appraisedAt: null },
    include: {
      appraisedBy: { select: { id: true, name: true } },
      listedBy: { select: { id: true, name: true } },
    },
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "PROPERTY_APPRAISAL_CLEARED",
    entityType: "Property",
    entityId: id,
  });
  return NextResponse.json(serializeBigInt(cleared));
}
