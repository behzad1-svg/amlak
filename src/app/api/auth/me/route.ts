import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { validateSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeBigInt } from "@/lib/utils";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("saj_token")?.value;
  const session = await validateSession(token);
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  // validateSession فقط فیلدهای لازم جلسه را می‌خواند؛ نام و شماره اینجا جداگانه گرفته می‌شود
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, phone: true, role: true, permissions: true },
  });
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json(serializeBigInt({ user }));
}
