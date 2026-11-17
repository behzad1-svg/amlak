/**
 * IP واقعی مشتری از هدرها — فقط وقتی پشت reverse-proxy معتبر هستیم
 * (TRUSTED_PROXY=true)؛ در غیر این صورت null تا سطل IP فعال نشود.
 * هدر خالی ("") هم مثل نبودن هدر است و به هدر بعدی می‌رسد.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  if (process.env.TRUSTED_PROXY !== "true") return null;
  // Caddy appends the real client IP last, so take the last non-empty entry;
  // a spoofed first entry is ignored. Single-proxy topology only.
  const parts = headers
    .get("x-forwarded-for")
    ?.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const last = parts && parts.length > 0 ? parts[parts.length - 1] : null;
  return last || headers.get("x-real-ip") || null;
}
