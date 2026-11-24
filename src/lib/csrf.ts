// بررسی مبدأ (Origin/Referer) برای درخواست‌های تغییردهندهٔ API — لایهٔ اول CSRF.
// کوکی نشست SameSite=Strict است، ولی این بررسی سروری جلوی درخواست‌های
// cross-site را می‌گیرد حتی اگر مرورگر SameSite را شل بگیرد. فقط وقتی
// Origin/Referer آمده باشد بررسی می‌شود تا تماس‌های سروربه‌سرور
// (cron با curl، بدون Origin) نشکنند.
//
// توجه: پشت CDN ‏(WCDN) و Caddy، مبدأیی که Next.js می‌بیند
// (req.nextUrl.origin) مبدأ داخلی سرور است (مثلاً http://127.0.0.1:3000)،
// نه مبدأ عمومی سایت — پس مقایسه با آن همهٔ درخواست‌های قانونی را رد
// می‌کند (لاگین هم با 403 «مبدأ درخواست معتبر نیست» می‌شکست).
// به‌جای آن، فقط با مبدأ شناخته‌شدهٔ سایت مقایسه می‌کنیم
// (بدون scheme و port). به هدر Host اعتماد نمی‌کنیم: هدر Host
// را مهاجم می‌تواند جعل کند، پس تنها مبدأ شناخته‌شده مجاز است.

/** مبدأ عمومی شناخته‌شدهٔ سایت. */
export const KNOWN_SITE_ORIGIN = "https://crm.amlaksaj.ir";

/** هاست (hostname) یک URL؛ اگر قابل تجزیه نباشد null. */
function hostnameOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** true یعنی مبدأ خارجی است و درخواست باید رد شود. */
export function isForeignOrigin(
  origin: string | null,
  referer: string | null,
  siteOrigin: string,
): boolean {
  const candidate = origin ?? referer;
  if (!candidate) return false;
  const candidateHost = hostnameOf(candidate);
  if (!candidateHost) return true;
  // مبدأ شناخته‌شدهٔ سایت همیشه مجاز است.
  const siteHost = hostnameOf(siteOrigin);
  if (siteHost && candidateHost === siteHost) return false;
  return true;
}

/** true یعنی این درخواست API باید بررسی مبدأ شود: غیر GET روی ‎/api/‎. */
export function needsOriginCheck(method: string, pathname: string): boolean {
  return method !== "GET" && pathname.startsWith("/api/");
}
