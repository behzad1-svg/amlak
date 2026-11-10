import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionFromCookies,
  hashPassword,
  invalidateUserTokens,
  verifyPassword,
} from "@/lib/auth";
import { changePasswordSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });

  const body = await req.json();
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "کاربر یافت نشد" }, { status: 404 });
  }

  const ok = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "رمز فعلی اشتباه است" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  });
  await invalidateUserTokens(user.id);
  await createAuditLog({
    actorId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "User",
    entityId: user.id,
  });

  return NextResponse.json({
    ok: true,
    message: "رمز عبور تغییر کرد. لطفا دوباره وارد شوید.",
  });
}
