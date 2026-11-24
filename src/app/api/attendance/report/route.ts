// گزارش ماهانهٔ حضور و غیاب — مدیر همه را می‌بیند، مشاور فقط خودش را.
// ماه شمسی است (YYYY-MM مثل 1405-09). غایب فقط برای روزهای کاریِ
// گذشته شمرده می‌شود؛ امروز هرگز غایب حساب نمی‌شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import {
  compareJalali,
  getJalaliDaysInMonth,
  getTodayJalali,
  jalaliToGregorian,
  MONTH_NAMES,
  toPersianDigits,
} from "@/lib/jalali";
import { isWorkingDay, tehranDateOnly } from "@/lib/attendance";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const settings = await getAttendanceSettings();
  const now = new Date();
  const todayJ = getTodayJalali(now);

  const monthParam = req.nextUrl.searchParams.get("month");
  const m = monthParam ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthParam) : null;
  const jy = m ? Number(m[1]) : todayJ.jy;
  const jm = m ? Number(m[2]) : todayJ.jm;
  if (jy < 1300 || jy > 1500) {
    return NextResponse.json({ error: "ماه معتبر نیست." }, { status: 400 });
  }
  const daysInMonth = getJalaliDaysInMonth(jy, jm);
  const isCurrentMonth = jy === todayJ.jy && jm === todayJ.jm;

  const monthStart = jalaliToGregorian(jy, jm, 1);
  const monthStartDate = new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate()));
  const monthEndG = jalaliToGregorian(jy, jm, daysInMonth);
  const monthEndDate = new Date(Date.UTC(monthEndG.getFullYear(), monthEndG.getMonth(), monthEndG.getDate()));
  // امروزِ تهران به‌صورت تاریخ میلادی — برای مقایسه با ستون @db.Date
  const tehranToday = tehranDateOnly(now);

  // روزهای کاری ماه تا امروز (ماه گذشته: کل ماه)
  let workingDays = 0;
  let pastWorkingDays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = { jy, jm, jd: d };
    if (isCurrentMonth && compareJalali(day, todayJ) > 0) break;
    if (!isWorkingDay(day, settings)) continue;
    workingDays++;
    if (compareJalali(day, todayJ) < 0) pastWorkingDays++;
  }

  const isOwner = session.user.role === "OWNER";
  const users = isOwner
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session.user.id, name: session.user.name }];
  const ids = users.map((u) => u.id);
  const records = await prisma.attendance.findMany({
    where: { userId: { in: ids }, date: { gte: monthStartDate, lte: monthEndDate }, checkInAt: { not: null } },
    select: { userId: true, date: true, lateMinutes: true },
  });
  // مرخصی‌های ماه — روز مرخصیِ گذشته که ورودی ندارد، غایب حساب نمی‌شود
  const leaves = await prisma.leave.findMany({
    where: { userId: { in: ids }, date: { gte: monthStartDate, lte: monthEndDate } },
    select: { userId: true, date: true },
  });
  const todayStr = tehranToday.toISOString().slice(0, 10);

  const usersOut = users.map((u) => {
    const mine = records.filter((r) => r.userId === u.id);
    const presentDates = new Set(mine.map((r) => r.date.toISOString().slice(0, 10)));
    const presentPastDays = [...presentDates].filter((d) => d < todayStr).length;
    const leavePastDays = new Set(
      leaves
        .filter((l) => l.userId === u.id)
        .map((l) => l.date.toISOString().slice(0, 10))
        .filter((d) => d < todayStr && !presentDates.has(d))
    ).size;
    return {
      id: u.id,
      name: u.name,
      presentDays: presentDates.size,
      lateSessions: mine.filter((r) => (r.lateMinutes ?? 0) > 0).length,
      leaveDays: leavePastDays,
      absentDays: Math.max(0, pastWorkingDays - presentPastDays - leavePastDays),
    };
  });

  return NextResponse.json({
    month: `${jy}-${String(jm).padStart(2, "0")}`,
    monthLabel: toPersianDigits(`${MONTH_NAMES[jm - 1]} ${jy}`),
    workingDays,
    users: usersOut,
  });
}
