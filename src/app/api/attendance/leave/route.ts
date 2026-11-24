// مرخصی حضور و غیاب — بدون تایید مدیر؛ مشاور خودش ثبت می‌کند.
// قانون بهزاد: یا روز قبل (یا زودتر)، یا در خودِ روز حداکثر تا یک ساعت
// پس از شروع شیفت؛ پس از آن سیستم اجازه نمی‌دهد.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import { jalaliToGregorian, toJalali } from "@/lib/jalali";
import {
  canRequestLeave,
  isWorkingDay,
  leaveScopesOverlap,
  LEAVE_REASON_MAX,
  LEAVE_SCOPE_LABELS,
  tehranDateOnly,
  type AttendanceSessionKey,
  type LeaveScope,
} from "@/lib/attendance";
import { z } from "zod";

const leaveSchema = z.object({
  dateIso: z.string({ error: "تاریخ معتبر نیست" }).min(1, "تاریخ معتبر نیست"),
  scope: z.enum(["MORNING", "EVENING", "FULL_DAY"], { error: "بازهٔ مرخصی معتبر نیست" }),
  reason: z.string().trim().max(LEAVE_REASON_MAX, "دلیل مرخصی خیلی طولانی است").optional(),
});

/** تاریخ میلادی نیمه‌شب UTC برای یک روز شمسی — برای ستون @db.Date. */
function gregorianDateOnly(j: { jy: number; jm: number; jd: number }): Date {
  const g = jalaliToGregorian(j.jy, j.jm, j.jd);
  return new Date(Date.UTC(g.getFullYear(), g.getMonth(), g.getDate()));
}

// فهرست مرخصی‌های پیش‌رو — مشاور فقط خودش را می‌بیند، مدیر همه را.
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const today = tehranDateOnly(new Date());
  const isOwner = session.user.role === "OWNER";
  const leaves = await prisma.leave.findMany({
    where: { date: { gte: today }, ...(isOwner ? {} : { userId: session.user.id }) },
    include: { user: { select: { name: true } } },
    orderBy: [{ date: "asc" }, { scope: "asc" }],
  });
  return NextResponse.json({
    leaves: leaves.map((l) => ({
      id: l.id,
      userId: l.userId,
      userName: l.user.name,
      date: l.date.toISOString(),
      scope: l.scope,
      scopeLabel: LEAVE_SCOPE_LABELS[l.scope as LeaveScope],
      reason: l.reason,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const settings = await getAttendanceSettings();
  const now = new Date();

  const body = await req.json().catch(() => null);
  const parsed = leaveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { scope, reason } = parsed.data;
  const j = toJalali(parsed.data.dateIso);
  if (!j || !isWorkingDay(j, settings)) {
    return NextResponse.json({ error: "این روز، روز کاری نیست." }, { status: 400 });
  }
  const date = gregorianDateOnly(j);

  const deadline = canRequestLeave(now, settings, date, scope);
  if (!deadline.ok) {
    return NextResponse.json({ error: deadline.message }, { status: 400 });
  }

  // تداخل با مرخصیِ همان روز (روز کامل با هر دو شیفت تداخل دارد)
  const existing = await prisma.leave.findMany({ where: { userId: session.user.id, date } });
  if (existing.some((e) => leaveScopesOverlap(e.scope as LeaveScope, scope))) {
    return NextResponse.json({ error: "برای این روز و این بازه قبلا مرخصی ثبت شده است." }, { status: 409 });
  }
  // اگر ورود آن شیفت قبلا ثبت شده، مرخصی بی‌معناست
  const sessions: AttendanceSessionKey[] = scope === "FULL_DAY" ? ["MORNING", "EVENING"] : [scope];
  const checkedIn = await prisma.attendance.findFirst({
    where: { userId: session.user.id, date, session: { in: sessions }, checkInAt: { not: null } },
  });
  if (checkedIn) {
    return NextResponse.json({ error: "ورود این شیفت قبلا ثبت شده است — مرخصی قابل ثبت نیست." }, { status: 409 });
  }

  const leave = await prisma.leave.create({
    data: { userId: session.user.id, date, scope, reason: reason?.trim() || null },
  });
  return NextResponse.json({ id: leave.id }, { status: 201 });
}

// لغو مرخصی — مشاور فقط خودش، مدیر هر کسی را؛ فقط برای امروز و آینده.
export async function DELETE(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "مرخصی مشخص نیست." }, { status: 400 });
  const leave = await prisma.leave.findUnique({ where: { id } });
  if (!leave) return NextResponse.json({ error: "مرخصی پیدا نشد." }, { status: 404 });
  const isOwner = session.user.role === "OWNER";
  if (!isOwner && leave.userId !== session.user.id) {
    return NextResponse.json({ error: "اجازهٔ لغو این مرخصی را ندارید." }, { status: 403 });
  }
  if (leave.date < tehranDateOnly(new Date())) {
    return NextResponse.json({ error: "مرخصیِ روز گذشته قابل لغو نیست." }, { status: 400 });
  }
  await prisma.leave.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
