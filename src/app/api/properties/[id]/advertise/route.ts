import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

// تهران DST ندارد؛ اختلاف ثابت ۳:۳۰+ با UTC — مثل کرون یادآوری‌ها
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function tehranDayStart(d: Date): Date {
  const t = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - TEHRAN_OFFSET_MS);
}

/** ثبت «آگهی کردن» فایل — مثل کارشناسی: Activity از نوع ADVERTISED برای آمار مدیر + اعلان برای مدیرها.
 * هر مشاور برای هر فایل در هر روز تقویمی (تهران) فقط یک بار می‌تواند آگهی ثبت کند. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // مدیر می‌تواند آگهی را به نام مشاور دیگر ثبت کند
  let agentId = session.user.id;
  if (body?.agentId && session.user.role === "OWNER") {
    const agent = await prisma.user.findUnique({ where: { id: body.agentId } });
    if (!agent || !agent.active) return NextResponse.json({ error: "مشاور معتبر نیست" }, { status: 400 });
    agentId = agent.id;
  } else if (body?.agentId && body.agentId !== session.user.id && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند آگهی را به نام دیگری ثبت کند" }, { status: 403 });
  }

  const property = await prisma.property.findUnique({ where: { id } });
  if (!property || property.deletedAt) return NextResponse.json({ error: "فایل یافت نشد" }, { status: 404 });

  // Only owner/lister can edit — same rule as PATCH on properties/[id] (IDOR fix 2026-11-21)
  if (session.user.role !== "OWNER" && property.listedById !== session.user.id) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  // تکرار همان روز — یک Activity در هر روز تقویمی تهران برای هر (مشاور، فایل)
  const todayStart = tehranDayStart(new Date());
  const existing = await prisma.activity.findFirst({
    where: { type: "ADVERTISED", agentId, propertyId: id, createdAt: { gte: todayStart } },
  });
  if (existing) {
    return NextResponse.json({ error: "امروز برای این فایل آگهی ثبت شده است" }, { status: 409 });
  }

  const agent = await prisma.user.findUnique({ where: { id: agentId }, select: { name: true } });
  const updated = await prisma.property.update({
    where: { id },
    data: { isAdvertised: true },
  });
  const activity = await prisma.activity.create({
    data: {
      type: "ADVERTISED",
      agentId,
      propertyId: id,
      description: `آگهی فایل ${property.code ?? property.title} انجام شد`,
    },
  });
  await createAuditLog({
    actorId: session.user.id,
    action: "PROPERTY_ADVERTISED",
    entityType: "Property",
    entityId: id,
    newValue: { agentId } as never,
  });
  // اعلان برای همه مدیرها — تا مدیر ببیند هر مشاور چه فایلی را آگهی کرده
  const owners = await prisma.user.findMany({ where: { role: "OWNER", active: true }, select: { id: true } });
  if (owners.length > 0) {
    const fileLabel = property.code ? `${property.code} — ${property.title}` : property.title;
    await prisma.notification.createMany({
      data: owners.map((o) => ({
        userId: o.id,
        type: "ADVERTISED" as never,
        priority: "NORMAL" as never,
        relatedType: "Property",
        relatedId: id,
        message: `${agent?.name ?? "مشاور"} فایل ${fileLabel} را آگهی کرد.`,
      })),
    });
  }
  return NextResponse.json(serializeBigInt({ property: updated, activity }));
}

/** آیا کاربر جاری امروز برای این فایل آگهی ثبت کرده؟ — برای حالت دکمه «آگهی کردم» */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const todayStart = tehranDayStart(new Date());
  const existing = await prisma.activity.findFirst({
    where: { type: "ADVERTISED", agentId: session.user.id, propertyId: id, createdAt: { gte: todayStart } },
    select: { id: true, createdAt: true },
  });
  return NextResponse.json({ advertisedToday: !!existing, at: existing?.createdAt ?? null });
}
