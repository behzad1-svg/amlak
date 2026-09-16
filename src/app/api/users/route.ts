import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { validateSession } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  // حریم خصوصی: فقط مدیر شماره همه را می‌بیند؛ مشاور فقط نام و نقش دیگران را می‌بیند
  if (session.user.role === "OWNER") {
    const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, phone: true, role: true } });
    return NextResponse.json(serializeBigInt(users));
  }

  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true } });
  // شماره خودِ کاربر را اضافه کن تا فرم‌ها کار کنند، ولی شماره دیگران را نده
  const self = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, phone: true, role: true } });
  const merged = users.map((u) => (u.id === self?.id ? (self as unknown as typeof u) : u));
  return NextResponse.json(serializeBigInt(merged));
}
