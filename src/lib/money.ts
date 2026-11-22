import { toPersianDigits } from "@/lib/jalali";

export function formatTomanWithWords(value: string | number | bigint | null | undefined): { formatted: string; words: string } {
  if (value == null || value === "") return { formatted: "—", words: "" };
  const str = String(value).replace(/[^0-9]/g, "");
  if (!str || str === "0") return { formatted: "۰ تومان", words: "" };
  const formatted = toPersianDigits(str.replace(/\B(?=(\d{3})+(?!\d))/g, ",")) + " تومان";
  const num = BigInt(str);
  const billion = num / BigInt(1_000_000_000);
  const remainderMillion = (num % BigInt(1_000_000_000)) / BigInt(1_000_000);
  let words = "";
  if (billion > 0) words += `${toPersianDigits(billion.toString())} میلیارد`;
  if (remainderMillion > 0) words += `${words ? " و " : ""}${toPersianDigits(remainderMillion.toString())} میلیون`;
  const remainderThousand = (num % BigInt(1_000_000)) / BigInt(1_000);
  if (words && remainderThousand > 0) words += ` و ${toPersianDigits(remainderThousand.toString())} هزار`;
  if (words) words += " تومان";
  // زیر یک میلیون حروفی جدا ندارد — همان عدد رقم‌خورده یک بار نشان داده
  // می‌شود؛ words خالی می‌ماند تا مبلغ دوبار نوشته نشود.
  return { formatted, words };
}

export function toPersianTomanWords(value: string | number | bigint | null | undefined): string {
  return formatTomanWithWords(value).words;
}
