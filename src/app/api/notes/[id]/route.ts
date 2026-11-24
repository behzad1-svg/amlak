import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { noteUpdateSchema } from "@/lib/validation";

// فقط یادداشتِ خودِ کاربر؛ اگر نباشد 404 می‌دهیم تا وجود یادداشت دیگران لو نرود.
async function findOwnNote(id: string, userId: string) {
  return prisma.note.findFirst({ where: { id, userId } });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await findOwnNote(id, session.user.id);
  if (!existing) return NextResponse.json({ error: "یادداشت پیدا نشد" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = noteUpdateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  let remindAt: Date | null | undefined;
  if (d.remindAt === undefined) {
    remindAt = undefined;
  } else if (d.remindAt === null || d.remindAt === "") {
    remindAt = null;
  } else {
    const at = new Date(d.remindAt);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "زمان یادآوری معتبر نیست" }, { status: 400 });
    remindAt = at;
  }
  const data: Record<string, unknown> = {};
  if (d.title !== undefined) data.title = (d.title ?? "").trim();
  if (d.content !== undefined) data.content = d.content.trim();
  if (remindAt !== undefined) data.remindAt = remindAt;
  if (d.done !== undefined) data.done = d.done;
  const note = await prisma.note.update({ where: { id: existing.id }, data });
  return NextResponse.json(note);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await findOwnNote(id, session.user.id);
  if (!existing) return NextResponse.json({ error: "یادداشت پیدا نشد" }, { status: 404 });
  await prisma.note.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
