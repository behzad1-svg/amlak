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
export type SessionStatus = "done" | "working" | "late" | "absent" | "open" | "upcoming" | "off";

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  done: "حاضر",
  working: "در حال کار",
  late: "دیرکرد",
  absent: "غایب",
  open: "در انتظار ورود",
  upcoming: "شروع نشده",
  off: "تعطیل",
};
