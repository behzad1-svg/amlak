import * as jalaali from "jalaali-js";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
export const MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export function toPersianDigits(str: string): string {
  return str.replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d)]);
}

export function toJalali(date: Date | string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!date) return null;
  const d = new Date(date);
  const { jy, jm, jd } = jalaali.toJalaali(d);
  return { jy, jm, jd };
}

export function formatJalali(date: Date | string | null | undefined, withDigits = true): string {
  const j = toJalali(date);
  if (!j) return "—";
  const str = `${j.jd} ${MONTH_NAMES[j.jm - 1]} ${j.jy}`;
  return withDigits ? toPersianDigits(str) : str;
}

export function formatJalaliShort(date: Date | string | null | undefined): string {
  const j = toJalali(date);
  if (!j) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
}

export function formatJalaliDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const j = toJalali(d);
  if (!j) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return toPersianDigits(`${j.jy}/${pad(j.jm)}/${pad(j.jd)} ${pad(d.getHours())}:${pad(d.getMinutes())}`);
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return new Date(gy, gm - 1, gd);
}

export function getJalaliDaysInMonth(jy: number, jm: number): number {
  return jalaali.jalaaliMonthLength(jy, jm);
}

export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  return jalaali.isValidJalaaliDate(jy, jm, jd);
}
export type JalaliDate = { jy: number; jm: number; jd: number };

// Jalali date of today in Tehran, independent of the server or browser time zone
export function getTodayJalali(now: Date = new Date()): JalaliDate {
  const parts = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type: string): number => {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : NaN;
  };
  return { jy: get("year"), jm: get("month"), jd: get("day") };
}

// Weekday name of today in Tehran, e.g. "شنبه"
export function getTehranWeekdayLong(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", weekday: "long" }).format(now);
}

// Compare two Jalali dates: negative means a is before b
export function compareJalali(a: JalaliDate, b: JalaliDate): number {
  if (a.jy !== b.jy) return a.jy - b.jy;
  if (a.jm !== b.jm) return a.jm - b.jm;
  return a.jd - b.jd;
}

// Is this date today in Tehran? Uses the same conversion as the display
// formatters, so the check always agrees with the rendered date.
export function isToday(date: Date | string | null | undefined): boolean {
  const j = toJalali(date);
  if (!j) return false;
  const t = getTodayJalali();
  return j.jy === t.jy && j.jm === t.jm && j.jd === t.jd;
}

// Is this Jalali day before today (Tehran)?
export function isPastJalaliDate(jy: number, jm: number, jd: number, today: JalaliDate = getTodayJalali()): boolean {
  return compareJalali({ jy, jm, jd }, today) < 0;
}

/** تهران UTC+3:30 است و از ۲۰۲۲ ساعت تابستانی ندارد — آفست ثابت امن است. */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** بازهٔ یک روز به وقت تهران: از ۰۰:۰۰ تا ۲۳:۵۹:۵۹٫۹۹۹ */
export function tehranDayBounds(now: Date = new Date()): { start: Date; end: Date } {
  const shifted = new Date(now.getTime() + TEHRAN_OFFSET_MS);
  const startShifted = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate())
  );
  const start = new Date(startShifted.getTime() - TEHRAN_OFFSET_MS);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

/**
 * بازهٔ یک روز به وقت تهران با فاصله از امروز: ۰ یعنی امروز، ۱ یعنی فردا،
 * ۲ یعنی پس‌فردا. تهران ساعت تابستانی ندارد، پس جابه‌جایی ۲۴ ساعته دقیق است.
 */
export function tehranDayBoundsOffset(now: Date = new Date(), dayOffset = 0): { start: Date; end: Date } {
  return tehranDayBounds(new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000));
}

/** روز و ماه شمسی بدون سال، مثل «۱ آذر» — برای عنوان کارت‌های فردا/پس‌فردا. */
export function formatJalaliDayMonth(date: Date | string | null | undefined): string {
  const j = toJalali(date);
  if (!j) return "—";
  return toPersianDigits(`${j.jd} ${MONTH_NAMES[j.jm - 1]}`);
}
