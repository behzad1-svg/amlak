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
  const users = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, phone: true, role: true } });
  return NextResponse.json(serializeBigInt(users));
}
