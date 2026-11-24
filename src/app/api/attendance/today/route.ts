// نمای امروز حضور و غیاب — مدیر همه را می‌بیند، مشاور فقط خودش را.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import {
  getTodayJalali,
  MONTH_NAMES,
  toPersianDigits,
} from "@/lib/jalali";
import {
  isCheckoutMissed,
  leaveCoversSession,
  tehranDateOnly,
  tehranParts,
  isWorkingDay,
  parseHHMM,
  type AttendanceSessionKey,
  type LeaveScope,
  type SessionStatus,
} from "@/lib/attendance";

const SESSIONS: AttendanceSessionKey[] = ["MORNING", "EVENING"];

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const settings = await getAttendanceSettings();
  const now = new Date();
  const todayJ = getTodayJalali(now);
  const working = isWorkingDay(todayJ, settings);
  const date = tehranDateOnly(now);
  const { hour, minute } = tehranParts(now);
  const nowMin = hour * 60 + minute;

  const isOwner = session.user.role === "OWNER";
  const users = isOwner
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      })
    : [{ id: session.user.id, name: session.user.name, role: session.user.role }];
  const ids = users.map((u) => u.id);
  const records = await prisma.attendance.findMany({
    where: { date, userId: { in: ids } },
  });
  const byKey = new Map(records.map((r) => [`${r.userId}:${r.session}`, r]));
  const leaves = await prisma.leave.findMany({ where: { date, userId: { in: ids } } });
  const leaveByUser = new Map<string, { scope: LeaveScope; reason: string | null }[]>();
  for (const l of leaves) {
    const arr = leaveByUser.get(l.userId) ?? [];
    arr.push({ scope: l.scope as LeaveScope, reason: l.reason });
    leaveByUser.set(l.userId, arr);
  }

  const windowOf = (s: AttendanceSessionKey) =>
    s === "MORNING"
      ? { start: settings.morningStart, end: settings.morningEnd }
      : { start: settings.eveningStart, end: settings.eveningEnd };

  const usersOut = users.map((u) => {
    const sessions: Record<string, object> = {};
    for (const s of SESSIONS) {
      const w = windowOf(s);
      const startMin = parseHHMM(w.start) ?? 0;
      const endMin = parseHHMM(w.end) ?? 0;
      const rec = byKey.get(`${u.id}:${s}`);
      const myLeaves = leaveByUser.get(u.id) ?? [];
      const leave = myLeaves.find((l) => leaveCoversSession(l.scope, s));
      let status: SessionStatus;
      if (!working) status = "off";
      else if (leave) status = "leave";
      else if (rec) status = rec.checkOutAt ? "done" : (rec.lateMinutes ?? 0) > 0 ? "late" : "working";
      else if (nowMin > endMin) status = "absent";
      else if (nowMin >= startMin - 60) status = "open";
      else status = "upcoming";
      sessions[s] = {
        session: s,
        start: w.start,
        end: w.end,
        status,
        checkInAt: rec?.checkInAt?.toISOString() ?? null,
        checkOutAt: rec?.checkOutAt?.toISOString() ?? null,
        // ورود ثبت شده ولی خروج نه، و مهلت خروج (یک ساعت پس از پایان شیفت)
        // گذشته — در جدول «مشاور خروج نزده» نشان داده می‌شود.
        checkoutMissed: !!rec && !rec.checkOutAt && isCheckoutMissed(now, s, settings),
        lateMinutes: rec?.lateMinutes ?? null,
        lateReason: rec?.lateReason ?? null,
        checkInDistanceM: rec?.checkInDistanceM ?? null,
        checkOutReason: rec?.checkOutReason ?? null,
        checkOutDistanceM: rec?.checkOutDistanceM ?? null,
        leaveReason: leave?.reason ?? null,
      };
    }
    return { id: u.id, name: u.name, role: u.role, sessions };
  });

  return NextResponse.json({
    dateLabel: toPersianDigits(`${todayJ.jd} ${MONTH_NAMES[todayJ.jm - 1]} ${todayJ.jy}`),
    isWorkingDay: working,
    settings: {
      morningStart: settings.morningStart,
      morningEnd: settings.morningEnd,
      eveningStart: settings.eveningStart,
      eveningEnd: settings.eveningEnd,
      radiusM: settings.radiusM,
    },
    users: usersOut,
  });
}
