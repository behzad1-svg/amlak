// حضور و غیاب — منطق خالص (بدون دیتابیس): فاصلهٔ هاورسین، ساعت تهران،
// تشخیص شیفت جاری و تاخیر. همهٔ زمان‌ها به وقت تهران حساب می‌شوند و
// وابسته به منطقهٔ زمانی سرور نیستند (Intl با timeZone صریح).
import { getTodayJalali, type JalaliDate } from "./jalali";
import { isFriday as isJalaliFriday } from "./holidays";

export type AttendanceSessionKey = "MORNING" | "EVENING";

export interface AttendanceSettings {
  officeLat: number;
  officeLng: number;
  radiusM: number;
  morningStart: string; // "HH:MM"
  morningEnd: string;
  eveningStart: string;
  eveningEnd: string;
  fridayOff: boolean;
}

/** بیشینهٔ طول دلیل تاخیر که مشاور خودش می‌نویسد. */
export const LATE_REASON_MAX = 200;

/** بیشینهٔ طول دلیل خروج از بیرون محدوده — همان سقف دلیل تاخیر. */
export const CHECKOUT_REASON_MAX = LATE_REASON_MAX;

/** ورود زودتر از شروع شیفت تا این‌قدر دقیقه مجاز است (تاخیر صفر). */
export const EARLY_CHECKIN_MINUTES = 60;

/** ۲۰ دقیقهٔ اول پس از شروع شیفت دیرکرد حساب نمی‌شود. */
export const LATE_GRACE_MINUTES = 20;

/** مهلت ثبت خروج: یک ساعت پس از پایان شیفت — صبح تا ۱۴:۰۰، عصر تا ۲۲:۰۰. */
export const CHECKOUT_DEADLINE_MINUTES = 60;

/** مرخصی — صبح، عصر یا روز کامل؛ بدون تایید مدیر (قانون بهزاد). */
export type LeaveScope = "MORNING" | "EVENING" | "FULL_DAY";

export const LEAVE_SCOPE_LABELS: Record<LeaveScope, string> = {
  MORNING: "صبح",
  EVENING: "عصر",
  FULL_DAY: "روز کامل",
};

/** بیشینهٔ طول دلیل مرخصی که مشاور خودش می‌نویسد. */
export const LEAVE_REASON_MAX = 200;

/** مهلت ثبت مرخصی در همان روز: یک ساعت پس از شروع شیفت. */
export const LEAVE_REQUEST_WINDOW_MINUTES = 60;

/** آیا این مرخصی آن شیفت را پوشش می‌دهد؟ */
export function leaveCoversSession(scope: LeaveScope, session: AttendanceSessionKey): boolean {
  return scope === "FULL_DAY" || scope === session;
}

/** آیا دو مرخصیِ یک روز با هم تداخل دارند؟ روز کامل با هر دو شیفت تداخل دارد. */
export function leaveScopesOverlap(a: LeaveScope, b: LeaveScope): boolean {
  return a === "FULL_DAY" || b === "FULL_DAY" || a === b;
}

/**
 * مهلت درخواست مرخصی — قانون بهزاد:
 * - روز قبل (یا زودتر) همیشه مجاز است؛
 * - در خودِ روز مرخصی فقط تا یک ساعت پس از شروع شیفت مربوطه
 *   (روز کامل = شروع شیفت صبح)؛ پس از آن سیستم اجازه نمی‌دهد.
 * leaveDate تاریخِ میلادیِ روز مرخصی است (نیمه‌شب UTC).
 */
export function canRequestLeave(
  now: Date,
  settings: AttendanceSettings,
  leaveDate: Date,
  scope: LeaveScope
): { ok: true } | { ok: false; message: string } {
  const today = tehranDateOnly(now);
  const leave = new Date(Date.UTC(leaveDate.getUTCFullYear(), leaveDate.getUTCMonth(), leaveDate.getUTCDate()));
  if (leave.getTime() < today.getTime()) {
    return { ok: false, message: "مرخصی برای روز گذشته قابل ثبت نیست." };
  }
  if (leave.getTime() > today.getTime()) return { ok: true };
  const startStr = scope === "EVENING" ? settings.eveningStart : settings.morningStart;
  const startMin = parseHHMM(startStr);
  if (startMin === null) return { ok: false, message: "ساعت‌های کاری تنظیم نشده‌اند." };
  const { hour, minute } = tehranParts(now);
  const nowMin = hour * 60 + minute;
  if (nowMin <= startMin + LEAVE_REQUEST_WINDOW_MINUTES) return { ok: true };
  return {
    ok: false,
    message: `مهلت ثبت مرخصی ${LEAVE_SCOPE_LABELS[scope]} امروز تمام شده است — مرخصی را باید روز قبل ثبت می‌کردی یا حداکثر تا یک ساعت پس از شروع شیفت.`,
  };
}

const EARTH_RADIUS_M = 6_371_000;

/** فاصلهٔ دو نقطهٔ جغرافیایی به متر (هاورسین). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * فاصلهٔ یک نقطه تا دفتر و اینکه بیرون شعاع است یا نه.
 * خروج از بیرون محدوده با دلیل ثبت می‌شود؛ ورود حتماً باید داخل شعاع باشد.
 */
export function distanceToOffice(
  lat: number,
  lng: number,
  settings: AttendanceSettings
): { distanceM: number; outside: boolean } {
  const distanceM = Math.round(haversineMeters(lat, lng, settings.officeLat, settings.officeLng));
  return { distanceM, outside: distanceM > settings.radiusM };
}

/** اجزای تاریخ و ساعت تهران برای یک لحظه: تاریخ میلادی، ساعت و دقیقه، نام روز هفته. */
export function tehranParts(now: Date = new Date()): {
  gy: number;
  gm: number;
  gd: number;
  hour: number;
  minute: number;
  weekday: string;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "long",
  }).formatToParts(now);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : NaN;
  };
  const weekday = parts.find((x) => x.type === "weekday")?.value ?? "";
  return { gy: get("year"), gm: get("month"), gd: get("day"), hour: get("hour"), minute: get("minute"), weekday };
}

/** تاریخِ میلادیِ «امروزِ تهران» به‌صورت Date در نیمه‌شب UTC — برای ستون @db.Date. */
export function tehranDateOnly(now: Date = new Date()): Date {
  const { gy, gm, gd } = tehranParts(now);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

/** دقیقه‌های از نیمه‌شب برای یک «HH:MM»؛ نامعتبر یعنی null. */
export function parseHHMM(s: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type SessionResolution =
  | { session: AttendanceSessionKey; lateMinutes: number }
  | { session: null; message: string };

/**
 * شیفت جاری برای ورود، بر مبنای ساعت تهران:
 * - از یک ساعت پیش از شروع تا پایان شیفت → همان شیفت (تاخیر = دقیقه از شروع منهای ۲۰ دقیقهٔ مهلت، حداقل صفر)
 * - پیش از آن / بین دو شیفت / پس از پایان شیفت عصر → null با پیام فارسی
 * اضافه‌کاری مشکلی ندارد: خروج پس از پایان شیفت جداگانه انجام می‌شود و اینجا ربطی ندارد.
 */
export function resolveSession(now: Date, settings: AttendanceSettings): SessionResolution {
  const { hour, minute } = tehranParts(now);
  const t = hour * 60 + minute;
  const mStart = parseHHMM(settings.morningStart);
  const mEnd = parseHHMM(settings.morningEnd);
  const eStart = parseHHMM(settings.eveningStart);
  const eEnd = parseHHMM(settings.eveningEnd);
  if (mStart === null || mEnd === null || eStart === null || eEnd === null) {
    return { session: null, message: "ساعت‌های کاری تنظیم نشده‌اند." };
  }
  if (t >= mStart - EARLY_CHECKIN_MINUTES && t <= mEnd) {
    return { session: "MORNING", lateMinutes: Math.max(0, t - mStart - LATE_GRACE_MINUTES) };
  }
  if (t >= eStart - EARLY_CHECKIN_MINUTES && t <= eEnd) {
    return { session: "EVENING", lateMinutes: Math.max(0, t - eStart - LATE_GRACE_MINUTES) };
  }
  if (t < mStart - EARLY_CHECKIN_MINUTES) {
    return { session: null, message: `شیفت صبح از ساعت ${settings.morningStart} شروع می‌شود.` };
  }
  if (t > mEnd && t < eStart - EARLY_CHECKIN_MINUTES) {
    return { session: null, message: `الان بین دو شیفت است — ورود عصر از ساعت ${settings.eveningStart}.` };
  }
  return { session: null, message: "شیفت امروز تمام شده است." };
}

/** دقیقهٔ مهلت خروج یک شیفت: پایان شیفت + یک ساعت (صبح ۱۳:۰۰ → ۱۴:۰۰، عصر ۲۱:۰۰ → ۲۲:۰۰)؛ تنظیمات نامعتبر یعنی null. */
export function checkoutDeadlineMin(session: AttendanceSessionKey, settings: AttendanceSettings): number | null {
  const end = parseHHMM(session === "MORNING" ? settings.morningEnd : settings.eveningEnd);
  return end === null ? null : end + CHECKOUT_DEADLINE_MINUTES;
}

/** آیا هنوز می‌توان برای این شیفت خروج زد؟ پس از مهلت (یک ساعت پس از پایان شیفت)، خروج بسته است. */
export function isCheckoutOpen(
  now: Date,
  session: AttendanceSessionKey,
  settings: AttendanceSettings
): { ok: true } | { ok: false; message: string } {
  const deadline = checkoutDeadlineMin(session, settings);
  if (deadline === null) return { ok: false, message: "ساعت‌های کاری تنظیم نشده‌اند." };
  const { hour, minute } = tehranParts(now);
  if (hour * 60 + minute <= deadline) return { ok: true };
  return {
    ok: false,
    message: `مهلت ثبت خروج شیفت ${SESSION_LABELS[session]} تمام شده است — خروج فقط تا ساعت ${formatMinutes(deadline)} ممکن بود.`,
  };
}

/** آیا مهلت خروج این شیفت گذشته است؟ (برای نمایش «مشاور خروج نزده» وقتی خروج ثبت نشده) */
export function isCheckoutMissed(now: Date, session: AttendanceSessionKey, settings: AttendanceSettings): boolean {
  const deadline = checkoutDeadlineMin(session, settings);
  if (deadline === null) return false;
  const { hour, minute } = tehranParts(now);
  return hour * 60 + minute > deadline;
}

/** آیا این روز شمسی روز کاری است؟ جمعه با fridayOff غیرکاری است. */
export function isWorkingDay(j: JalaliDate, settings: AttendanceSettings): boolean {
  if (settings.fridayOff && isJalaliFriday(j.jy, j.jm, j.jd)) return false;
  return true;
}

/** آیا «امروزِ تهران» روز کاری است؟ */
export function isTodayWorkingDay(now: Date, settings: AttendanceSettings): boolean {
  return isWorkingDay(getTodayJalali(now), settings);
}

export const SESSION_LABELS: Record<AttendanceSessionKey, string> = {
  MORNING: "صبح",
  EVENING: "عصر",
};

export function sessionLabel(s: AttendanceSessionKey): string {
  return SESSION_LABELS[s];
}

/** برچسب وضعیت یک شیفت در جدول امروز. */
export type SessionStatus = "done" | "working" | "late" | "absent" | "open" | "upcoming" | "off" | "leave";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  done: "حاضر",
  working: "در حال کار",
  late: "دیرکرد",
  absent: "غایب",
  open: "در انتظار ورود",
  upcoming: "شروع نشده",
  off: "تعطیل",
  leave: "مرخصی",
};
