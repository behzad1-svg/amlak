// بررسی مبدأ (Origin/Referer) برای درخواست‌های تغییردهندهٔ API — لایهٔ اول CSRF.
// کوکی نشست SameSite=Strict است، ولی این بررسی سروری جلوی درخواست‌های
// cross-site را می‌گیرد حتی اگر مرورگر SameSite را شل بگیرد. فقط وقتی
// Origin/Referer آمده باشد بررسی می‌شود تا تماس‌های سروربه‌سرور
// (cron با curl، بدون Origin) نشکنند.

/** true یعنی مبدأ خارجی است و درخواست باید رد شود. */
export function isForeignOrigin(
  origin: string | null,
  referer: string | null,
  siteOrigin: string,
): boolean {
  const candidate = origin ?? referer;
  if (!candidate) return false;
  try {
    return new URL(candidate).origin !== siteOrigin;
  } catch {
    return true;
  }
}

/** true یعنی این درخواست API باید بررسی مبدأ شود: غیر GET روی ‎/api/‎. */
export function needsOriginCheck(method: string, pathname: string): boolean {
  return method !== "GET" && pathname.startsWith("/api/");
}
