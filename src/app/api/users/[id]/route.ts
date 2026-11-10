import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies, hashPassword, invalidateUserTokens } from "@/lib/auth";
import { userUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند کاربر را ویرایش کند" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });

  const body = await req.json();
  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // Prevent locking out the last active OWNER
  if (existing.role === "OWNER" && (d.role === "AGENT" || d.active === false)) {
    const otherOwners = await prisma.user.count({
      where: { role: "OWNER", active: true, id: { not: id } },
    });
    if (otherOwners === 0) {
      return NextResponse.json({ error: "حداقل یک مدیر فعال باید باقی بماند" }, { status: 400 });
    }
  }

  if (d.phone && d.phone !== existing.phone) {
    const clash = await prisma.user.findUnique({ where: { phone: d.phone } });
    if (clash) return NextResponse.json({ error: "این شماره قبلا ثبت شده است" }, { status: 409 });
  }

  const data: Record<string, unknown> = {};
  if (d.name !== undefined) data.name = d.name;
  if (d.phone !== undefined) data.phone = d.phone;
  if (d.role !== undefined) data.role = d.role;
  if (d.active !== undefined) data.active = d.active;
  if (d.password) data.passwordHash = await hashPassword(d.password);

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, phone: true, role: true, active: true, createdAt: true },
  });

  // Invalidate sessions when password/role/active changes
  const securityChange = Boolean(d.password) || d.role !== undefined || d.active === false;
  if (securityChange) {
    try {
      await invalidateUserTokens(id);
    } catch (e) {
      console.error("tokenVersion increment failed", e);
    }
  }

  await createAuditLog({
    actorId: session.user.id,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: id,
    newValue: {
      name: user.name,
      phone: user.phone,
      role: user.role,
      active: user.active,
      passwordReset: Boolean(d.password),
    } as never,
  });

  return NextResponse.json(serializeBigInt(user));
}
