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
  const where: Record<string, unknown> = { userId: session.user.id };
  if (unreadOnly) where.read = false;
  const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  const unreadCount = await prisma.notification.count({ where: { userId: session.user.id, read: false } });
  return NextResponse.json({ notifications: serializeBigInt(notifications), unreadCount });
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
