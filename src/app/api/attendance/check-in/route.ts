// ثبت ورود — با GPS داخل شعاع دفتر، یا با وای‌فای دفتر (آی‌پی استاتیک دفتر)
// وقتی GPS گوشی خطا می‌دهد. تاخیر خودکار حساب می‌شود و دلیلش را مشاور
// خودش در یک فیلد آزاد می‌نویسد («دلیل تاخیر:») — هیچ گزینهٔ آماده‌ای نیست.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import { getTodayJalali } from "@/lib/jalali";
import { clientIpFromHeaders } from "@/lib/clientIp";
import {
  haversineMeters,
  isOfficeIp,
  isWorkingDay,
  LATE_REASON_MAX,
  leaveCoversSession,
  resolveSession,
  sessionLabel,
  tehranDateOnly,
} from "@/lib/attendance";
import { toFaDigits } from "@/lib/utils";
import { z } from "zod";

// مختصات اختیاری است: وقتی GPS در دسترس نیست، ورود فقط با آی‌پی دفتر
// (وای‌فای دفتر) هم ممکن است — سرور آی‌پی را خودش می‌خواند.
const checkInSchema = z.object({
  lat: z.number({ error: "موقعیت معتبر نیست" }).min(-90, "موقعیت معتبر نیست").max(90, "موقعیت معتبر نیست").optional(),
  lng: z.number({ error: "موقعیت معتبر نیست" }).min(-180, "موقعیت معتبر نیست").max(180, "موقعیت معتبر نیست").optional(),
  reason: z.string().trim().max(LATE_REASON_MAX, "دلیل تاخیر خیلی طولانی است").optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const settings = await getAttendanceSettings();
  const now = new Date();

  if (!isWorkingDay(getTodayJalali(now), settings)) {
    return NextResponse.json({ error: "امروز جمعه است و روز غیرکاری است." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = checkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { reason } = parsed.data;

  const resolved = resolveSession(now, settings);
  if (!resolved.session) {
    return NextResponse.json({ error: resolved.message }, { status: 400 });
  }
  const { session: sessionKey, lateMinutes } = resolved;

  // وای‌فای دفتر (آی‌پی استاتیک) یعنی داخل دفتر — بدون نیاز به GPS؛
  // در غیر این صورت GPS باید داخل شعاع باشد. ورود صبح هم با آی‌پی دفتر
  // قبول است (همان سخت‌گیری «حتماً داخل دفتر»).
  const viaOfficeIp = isOfficeIp(clientIpFromHeaders(req.headers), settings);
  let distance: number;
  let lat: number | null = null;
  let lng: number | null = null;
  if (viaOfficeIp) {
    distance = 0;
  } else {
    if (typeof parsed.data.lat !== "number" || typeof parsed.data.lng !== "number") {
      return NextResponse.json(
        { error: "موقعیت در دسترس نیست — GPS گوشی را روشن کنید، یا به وای‌فای دفتر وصل شوید و دوباره تلاش کنید." },
        { status: 400 }
      );
    }
    lat = parsed.data.lat;
    lng = parsed.data.lng;
    distance = Math.round(haversineMeters(lat, lng, settings.officeLat, settings.officeLng));
    if (distance > settings.radiusM) {
      return NextResponse.json(
        {
          error: `خارج از محدوده دفتر هستی — فاصله‌ات ${toFaDigits(String(distance))} متر است (حد مجاز ${toFaDigits(String(settings.radiusM))} متر).`,
          distanceM: distance,
        },
        { status: 400 }
      );
    }
  }

  const date = tehranDateOnly(now);
  const onLeave = await prisma.leave.findMany({ where: { userId: session.user.id, date } });
  if (onLeave.some((l) => leaveCoversSession(l.scope as "MORNING" | "EVENING" | "FULL_DAY", sessionKey))) {
    return NextResponse.json({ error: `برای شیفت ${sessionLabel(sessionKey)} امروز مرخصی ثبت کرده‌اید.` }, { status: 400 });
  }
  const existing = await prisma.attendance.findUnique({
    where: { userId_date_session: { userId: session.user.id, date, session: sessionKey } },
  });
  if (existing?.checkInAt) {
    return NextResponse.json({ error: `ورود ${sessionLabel(sessionKey)} امروز قبلا ثبت شده است.` }, { status: 409 });
  }

  const lateReason = lateMinutes > 0 ? reason?.trim() || null : null;
  const record = await prisma.attendance.upsert({
    where: { userId_date_session: { userId: session.user.id, date, session: sessionKey } },
    update: {
      checkInAt: now,
      checkInLat: lat,
      checkInLng: lng,
      checkInDistanceM: distance,
      lateMinutes,
      lateReason,
    },
    create: {
      userId: session.user.id,
      date,
      session: sessionKey,
      checkInAt: now,
      checkInLat: lat,
      checkInLng: lng,
      checkInDistanceM: distance,
      lateMinutes,
      lateReason,
    },
  });
  return NextResponse.json(record);
}
