// فیلتر سمت کاربر برای SearchSelect — نرمال‌سازی فارسی/عربی و ارقام
// (ي/ك عربی → ی/ک فارسی، نیم‌فاصله حذف، ارقام فارسی/عربی → لاتین)
import { normalizePersianTerm } from "./search";
import { toEnDigits } from "./utils";

export type SearchableOption = { id: string; label: string; sub?: string };

/** نرمال‌سازی متن برای مقایسه: ي/ك، نیم‌فاصله، ارقام فارسی/عربی، کوچک‌سازی */
export function normalizeSearchText(s: string): string {
  return toEnDigits(normalizePersianTerm(s)).toLowerCase();
}

/** فیلتر گزینه‌ها روی label و sub و id؛ کوئری خالی همه را برمی‌گرداند */
export function filterSearchOptions<T extends SearchableOption>(options: T[], query: string): T[] {
  const q = normalizeSearchText(query.trim());
  if (!q) return options;
  return options.filter(
    (o) =>
      normalizeSearchText(o.label).includes(q) ||
      (o.sub ? normalizeSearchText(o.sub).includes(q) : false) ||
      normalizeSearchText(o.id).includes(q)
  );
}
