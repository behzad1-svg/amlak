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
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + " تومان";
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
