// مقایسهٔ ثابت‌زمان رمز کرون — `!==` زمان پاسخ را با طول پیشوند مشترک لو می‌دهد.
// timingSafeEqual روی بافرهای هم‌طول کار می‌کند، پس اول طول چک می‌شود.
import { timingSafeEqual } from "node:crypto";

export function isValidCronSecret(provided: string | null, secret: string): boolean {
  if (provided == null) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
