// جستجوی فارسی — نیم فاصله (U+200C) و ي/ك عربی
// کاربر معمولا بدون نیم فاصله تایپ می‌کند («سهمبندی») ولی داده ذخیره‌شده
// نیم فاصله دارد؛ ILIKE پستگرس آن‌ها را دو کاراکتر متفاوت می‌داند
// و contains ساده هیچ‌وقت نمی‌گیرد. پس از عبارت جستجو چند گونه می‌سازیم:
// خود عبارت، عبارت بدون نیم فاصله، و همان بدون نیم فاصله با یک نیم فاصله
// در هر جای ممکن — تا متنی که نیم فاصله دارد هم پیدا شود.
// توجه: نیم فاصله در این فایل فقط با escape نوشته شده (\u200C) چون
// کاراکتر نامرئی آن در ویرایش گم می‌شود.

export const ZWNJ = "\u200C";

function stripZwnj(s: string): string {
  return s.replace(/\u200C/g, "");
}

// ي عربی → ی فارسی، ك عربی → ک فارسی؛ نیم فاصله‌ها حذف می‌شوند
export function normalizePersianTerm(term: string): string {
  return stripZwnj(term).replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
}

// گونه‌های جستجو برای یک عبارت: خود عبارت + بدون نیم فاصله + با یک نیم فاصله
// در هر جای ممکن (فقط برای عبارت‌های کوتاه، تا OR خیلی بزرگ نشود)
export function persianSearchVariants(term: string): string[] {
  const raw = term.trim();
  if (!raw) return [];
  const stripped = normalizePersianTerm(raw);
  const set = new Set<string>([raw, stripped]);
  if (stripped.length > 1 && stripped.length <= 15) {
    for (let i = 1; i < stripped.length; i++) {
      set.add(stripped.slice(0, i) + ZWNJ + stripped.slice(i));
    }
  }
  return [...set];
}

// شرایط OR برای Prisma: هر فیلد × هر گونه
export function persianSearchOr(
  fields: string[],
  term: string,
): Record<string, unknown>[] {
  const variants = persianSearchVariants(term);
  const ors: Record<string, unknown>[] = [];
  for (const field of fields) {
    for (const v of variants) {
      ors.push({ [field]: { contains: v, mode: "insensitive" } });
    }
  }
  return ors;
}
