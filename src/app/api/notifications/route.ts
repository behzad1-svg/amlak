import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { findInvalidQueryParam } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

const NOTIFICATION_TYPES = ["MATCH_SUGGESTION", "FOLLOW_UP_OVERDUE", "VIEWING_REMINDER", "ACCESS_GRANTED", "CUSTOMER_TRANSFERRED", "SESSION_CARD", "ADVERTISED"] as const;
type NotificationTypeName = (typeof NOTIFICATION_TYPES)[number];

function invalidType(value: string | null): value is string {
  return !!value && !(NOTIFICATION_TYPES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const type = searchParams.get("type");
  const excludeType = searchParams.get("excludeType");
  if (invalidType(type)) {
    return NextResponse.json({ error: "مقدار «type» معتبر نیست" }, { status: 400 });
  }
  if (invalidType(excludeType)) {
    return NextResponse.json({ error: "مقدار «excludeType» معتبر نیست" }, { status: 400 });
  }
  if (type && excludeType) {
    return NextResponse.json({ error: "«type» و «excludeType» را با هم نفرستید" }, { status: 400 });
  }
  const invalidParam = findInvalidQueryParam([
    { name: "page", value: searchParams.get("page") },
    { name: "limit", value: searchParams.get("limit") },
  ]);
  if (invalidParam) {
    return NextResponse.json({ error: `مقدار «${invalidParam}» معتبر نیست` }, { status: 400 });
  }
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.read = false;
  if (type) where.type = type as NotificationTypeName;
  if (excludeType) where.type = { not: excludeType as NotificationTypeName };
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
  ]);
  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, read: false } });
  return NextResponse.json({ ...serializeBigInt({ notifications }), unreadCount, total, page, limit });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بدنهٔ درخواست معتبر نیست" }, { status: 400 });
  }
  if (body.markAllRead) {
    const type = typeof body.type === "string" ? body.type : null;
    const excludeType = typeof body.excludeType === "string" ? body.excludeType : null;
    if (invalidType(type)) {
      return NextResponse.json({ error: "مقدار «type» معتبر نیست" }, { status: 400 });
    }
    if (invalidType(excludeType)) {
      return NextResponse.json({ error: "مقدار «excludeType» معتبر نیست" }, { status: 400 });
    }
    if (type && excludeType) {
      return NextResponse.json({ error: "«type» و «excludeType» را با هم نفرستید" }, { status: 400 });
    }
    await prisma.notification.updateMany({
      where: {
        userId: session.user.id,
        read: false,
        ...(type ? { type: type as NotificationTypeName } : {}),
        ...(excludeType ? { type: { not: excludeType as NotificationTypeName } } : {}),
      },
      data: { read: true, readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }
  if (body.id) {
    const n = await prisma.notification.findUnique({ where: { id: body.id } });
    if (!n || n.userId !== session.user.id) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
    await prisma.notification.update({ where: { id: body.id }, data: { read: true, readAt: new Date() } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "پارامتر نامعتبر" }, { status: 400 });
}
