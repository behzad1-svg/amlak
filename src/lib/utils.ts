import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatJalaliShort, formatJalaliDateTime } from "./jalali";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function serializeBigInt<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value
    )
  );
}

export function formatToman(value: bigint | string | number | null | undefined): string {
  if (value == null) return "—";
  const str = value.toString();
  return toFaDigits(str.replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + " تومان";
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const FA_TO_EN: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** اعداد لاتین را به فارسی تبدیل می‌کند */
export function toFaDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** ارقام فارسی و عربی را به لاتین تبدیل می‌کند (برای ورودی‌های عددی) */
export function toEnDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => FA_TO_EN[d] ?? d);
}

/**
 * نمایش فشرده مبلغ برای صفحه‌های کوچک — مثلا «۳٫۵ میلیارد تومان»، «۵۰۰ میلیون تومان».
 * مقدار واقعی عوض نمی‌شود؛ فقط نمایش خلاصه است. با bare=true واحد «تومان» حذف
 * می‌شود (برای ابتدای بازه «از ... تا ...» که واحد در انتها یک بار می‌آید).
 */
export function formatTomanCompact(
  value: bigint | string | number | null | undefined,
  bare = false
): string {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return formatToman(value);
  const unit = bare ? "" : " تومان";
  const fmt = (n: number) => {
    const s = n % 1 === 0 ? String(n) : n.toFixed(1).replace(/\.0$/, "");
    return toFaDigits(s.replace(".", "٫"));
  };
  if (num >= 1_000_000_000)
    return `${fmt(Math.round((num / 1_000_000_000) * 10) / 10)} میلیارد${unit}`;
  if (num >= 1_000_000)
    return `${fmt(Math.round((num / 1_000_000) * 10) / 10)} میلیون${unit}`;
  if (num >= 1_000)
    return `${fmt(Math.round((num / 1_000) * 10) / 10)} هزار${unit}`;
  return formatToman(value);
}

export { formatJalali, formatJalaliShort, formatJalaliDateTime } from "./jalali";

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return formatJalaliShort(date);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return formatJalaliDateTime(date);
}
