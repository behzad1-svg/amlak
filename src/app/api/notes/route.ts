import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { noteCreateSchema } from "@/lib/validation";

// دفترچه یادداشت شخصی — هر کاربر فقط یادداشت‌های خودش را می‌بیند
// (قانون همیشگی: هر کسی واسه خودش).

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const notes = await prisma.note.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ notes });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = noteCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const d = parsed.data;
  let remindAt: Date | null = null;
  if (d.remindAt) {
    const at = new Date(d.remindAt);
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "زمان یادآوری معتبر نیست" }, { status: 400 });
    remindAt = at;
  }
  const note = await prisma.note.create({
    data: { userId: session.user.id, title: d.title?.trim() || "", content: d.content.trim(), remindAt },
  });
  return NextResponse.json(note, { status: 201 });
}
