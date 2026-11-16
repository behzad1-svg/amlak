/**
 * IP واقعی مشتری از هدرها — فقط وقتی پشت reverse-proxy معتبر هستیم
 * (TRUSTED_PROXY=true)؛ در غیر این صورت null تا سطل IP فعال نشود.
 * هدر خالی ("") هم مثل نبودن هدر است و به هدر بعدی می‌رسد.
 */
export function clientIpFromHeaders(headers: { get(name: string): string | null }): string | null {
  if (process.env.TRUSTED_PROXY !== "true") return null;
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || null;
}
