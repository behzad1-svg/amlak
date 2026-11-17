// مشاور همکار (تعاون) در کارت جلسه — حداکثر ۳ نفر
export const MAX_SESSION_CARD_CO_ADVISORS = 3;

/// یکتاسازی فهرست مشاورهای همکار: خالی‌ها و سازنده کارت حذف، ترتیب حفظ.
/// سقف ۳ نفر با اسکیمای Zod اعمال، نه اینجا.
export function normalizeCoAdvisorIds(input: unknown, creatorId?: string): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const id = v.trim();
    if (!id || id === creatorId || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
