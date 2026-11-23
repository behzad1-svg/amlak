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
  tehranDateOnly,
  tehranParts,
  isWorkingDay,
  parseHHMM,
  type AttendanceSessionKey,
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
      let status: SessionStatus;
      if (!working) status = "off";
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
        lateMinutes: rec?.lateMinutes ?? null,
        lateReason: rec?.lateReason ?? null,
        checkInDistanceM: rec?.checkInDistanceM ?? null,
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
