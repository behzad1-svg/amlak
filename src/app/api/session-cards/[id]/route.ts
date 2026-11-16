import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { sessionCardUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

const CARD_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  property: { select: { id: true, title: true, code: true, owner: { select: { id: true, name: true } } } },
  advisor: { select: { id: true, name: true } },
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.sessionCard.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "کارت جلسه یافت نشد" }, { status: 404 });
  const isOwner = session.user.role === "OWNER";
  const isCreator = existing.advisorId === session.user.id;
  if (!isOwner && !isCreator) return NextResponse.json({ error: "به این کارت دسترسی ندارید" }, { status: 403 });
  const body = await req.json();
  const parsed = sessionCardUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  // گذرهای مجاز: PENDING → CONFIRMED / CANCELLED و CONFIRMED → CANCELLED؛ لغوشده نهایی است
  if (existing.status === "CANCELLED") return NextResponse.json({ error: "این کارت لغو شده است و دیگر قابل تغییر نیست" }, { status: 400 });
  if (existing.status === "CONFIRMED" && d.status !== "CANCELLED") return NextResponse.json({ error: "این کارت قبلاً تأیید شده است؛ فقط می‌توان آن را لغو کرد" }, { status: 400 });
  // سازنده فقط می‌تواند کارت خودش را لغو کند؛ تأیید فقط با مدیر است
  if (!isOwner && d.status !== "CANCELLED") return NextResponse.json({ error: "فقط مدیر می‌تواند کارت جلسه را تأیید کند" }, { status: 403 });
  const data: Record<string, unknown> = {};
  if (d.status !== undefined) data.status = d.status;
  if (isOwner && d.managerNote !== undefined) data.managerNote = d.managerNote || null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "تغییری نفرستاده‌اید" }, { status: 400 });
  const card = await prisma.sessionCard.update({ where: { id }, data: data as never, include: CARD_INCLUDE });
  await createAuditLog({
    actorId: session.user.id,
    action: "SESSION_CARD_UPDATED",
    entityType: "SessionCard",
    entityId: id,
    oldValue: { status: existing.status } as never,
    newValue: { status: card.status } as never,
  });
  return NextResponse.json(serializeBigInt(card));
}
