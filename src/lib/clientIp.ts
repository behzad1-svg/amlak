import { isIP } from "node:net";

/**
 * Real client IP — read ONLY from X-Real-IP. Caddy (trusted_proxies limited
 * to the WCDN ranges) puts the validated client IP there; X-Forwarded-For
 * is never read (its first entry is forgeable). Null unless behind a
 * trusted reverse proxy (TRUSTED_PROXY=true).
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  if (process.env.TRUSTED_PROXY !== "true") return null;
  const ip = headers.get("x-real-ip")?.trim();
  // فقط یک IP معتبر (v4 یا v6) — مقدار غیر-IP (مثلاً متن جعلی) رد می‌شود.
  return ip && isIP(ip) !== 0 ? ip : null;
}
