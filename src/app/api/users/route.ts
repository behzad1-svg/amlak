import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, hashPassword } from "@/lib/auth";
import { userCreateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  // حریم خصوصی: فقط مدیر شماره همه را می‌بیند؛ مشاور فقط نام و نقش دیگران را می‌بیند
  if (session.user.role === "OWNER") {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, role: true, active: true, createdAt: true },
    });
    return NextResponse.json(serializeBigInt(users));
  }

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, role: true },
  });
  const self = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, phone: true, role: true, active: true, createdAt: true },
  });
  const merged = users.map((u) => (u.id === self?.id ? (self as unknown as typeof u) : u));
  return NextResponse.json(serializeBigInt(merged));
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند کاربر بسازد" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone: d.phone } });
  if (existing) {
    return NextResponse.json({ error: "این شماره قبلا ثبت شده است" }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: {
      name: d.name,
      phone: d.phone,
      passwordHash: await hashPassword(d.password),
      role: d.role ?? "AGENT",
    },
    select: { id: true, name: true, phone: true, role: true, active: true, createdAt: true },
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    newValue: { name: user.name, phone: user.phone, role: user.role } as never,
  });

  return NextResponse.json(serializeBigInt(user), { status: 201 });
}
