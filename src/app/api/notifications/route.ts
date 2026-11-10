import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  return validateSession(token);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get("unreadOnly") === "true";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")));
  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.read = false;
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
  const body = await req.json();
  if (body.markAllRead) {
    await prisma.notification.updateMany({ where: { userId: session.user.id, read: false }, data: { read: true, readAt: new Date() } });
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
