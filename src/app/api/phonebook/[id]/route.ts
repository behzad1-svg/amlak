import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { phonebookUpdateSchema } from "@/lib/validation";
import { createAuditLog } from "@/lib/audit";
import { hasPermission } from "@/lib/permissions";
import { canAccessPhonebookContact } from "@/lib/access";

function canEdit(user: { id: string; role: string }, contact: { ownerId: string }) {
  return user.role === "OWNER" || contact.ownerId === user.id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const contact = await prisma.phonebookContact.findUnique({
    where: { id },
    include: { owner: { select: { id: true, name: true } } },
  });
  if (!contact || contact.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canAccessPhonebookContact(session.user, contact)) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }
  return NextResponse.json(contact);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.phonebookContact.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canEdit(session.user, existing)) {
    return NextResponse.json({ error: "فقط ثبت‌کننده یا مدیر می‌تواند ویرایش کند" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = phonebookUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  if (d.phone && d.phone !== existing.phone) {
    const clash = await prisma.phonebookContact.findFirst({
      where: { phone: d.phone, deletedAt: null, id: { not: id } },
    });
    if (clash) {
      return NextResponse.json(
        { error: "این شماره در دفترچه تلفن ثبت شده است", existingId: clash.id },
        { status: 409 },
      );
    }
  }

  let updated: Awaited<ReturnType<typeof prisma.phonebookContact.update>>;
  try {
    updated = await prisma.phonebookContact.update({
      where: { id },
      data: {
        ...(d.name !== undefined ? { name: d.name } : {}),
        ...(d.phone !== undefined ? { phone: d.phone } : {}),
        ...(d.phone2 !== undefined ? { phone2: d.phone2 } : {}),
        ...(d.email !== undefined ? { email: d.email } : {}),
        ...(d.group !== undefined ? { group: d.group as never } : {}),
        ...(d.tags !== undefined ? { tags: d.tags } : {}),
        ...(d.notes !== undefined ? { notes: d.notes } : {}),
        ...(d.isVip !== undefined ? { isVip: d.isVip } : {}),
        ...(d.isPinned !== undefined ? { isPinned: d.isPinned } : {}),
        ...(d.isPrivate !== undefined ? { isPrivate: d.isPrivate } : {}),
      },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "این شماره در دفترچه تلفن ثبت شده است" }, { status: 409 });
    }
    throw e;
  }

  await createAuditLog({
    actorId: session.user.id,
    action: "PHONEBOOK_UPDATED",
    entityType: "PhonebookContact",
    entityId: id,
    newValue: { name: updated.name } as never,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.phonebookContact.findUnique({ where: { id } });
  if (!existing || existing.deletedAt) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (!canEdit(session.user, existing)) {
    return NextResponse.json({ error: "فقط ثبت‌کننده یا مدیر می‌تواند حذف کند" }, { status: 403 });
  }
  if (!hasPermission(session.user, "canDeletePhonebook")) {
    return NextResponse.json({ error: "اجازه حذف دفترچه تلفن ندارید" }, { status: 403 });
  }

  await prisma.phonebookContact.update({ where: { id }, data: { deletedAt: new Date() } });
  await createAuditLog({
    actorId: session.user.id,
    action: "PHONEBOOK_DELETED",
    entityType: "PhonebookContact",
    entityId: id,
    newValue: { name: existing.name } as never,
  });
  return NextResponse.json({ ok: true });
}
