import * as jalaali from "jalaali-js";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
const MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

export function toPersianDigits(str: string): string {
  return str.replace(/\d/g, (d) => PERSIAN_DIGITS[parseInt(d)]);
}

export function toJalali(date: Date | string | null | undefined): { jy: number; jm: number; jd: number } | null {
  if (!date) return null;
  const d = new Date(date);
  const { jy, jm, jd } = jalaali.toJalaali(d);
  return { jy, jm, jd };
}

export function formatJalali(date: Date | string | null | undefined, withDigits?: boolean): string {
  const j = toJalali(date);
  if (!j) return "—";
  const str = `${j.jd} ${MONTH_NAMES[j.jm - 1]} ${j.jy}`;
  return withDigits ? toPersianDigits(str) : str;
}

export function formatJalaliShort(date: Date | string | null | undefined): string {
  const j = toJalali(date);
  if (!j) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
}

export function formatJalaliDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = new Date(date);
  const j = toJalali(d);
  if (!j) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${j.jy}/${pad(j.jm)}/${pad(j.jd)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
