// خروج خودکار پس از بی‌فعالیتی — بهزاد ۱۴۰۵/۰۹/۰۱: اگر کاربر واردشده ۲۰ دقیقه
// هیچ کاری نکند، نشست او بسته و به صفحهٔ ورود فرستاده می‌شود. طول مطلق نشست
// (۲۴ ساعت، TOKEN_EXPIRY_SECONDS) دست نخورده؛ فقط سقف بی‌فعالیتی اضافه شده است.
// ردیابی در سمت کلاینت انجام می‌شود چون نشست JWT بی‌حالت است و هیچ
// «آخرین فعالیت» سمت سرور ذخیره نمی‌شود؛ افزودن آن یعنی نوشتن در دیتابیس
// برای هر درخواست، که برای این نیاز بیش‌ازحد است.

/** بی‌فعالیتی مجاز پیش از خروج خودکار: ۲۰ دقیقه. */
export const IDLE_TIMEOUT_MS = 20 * 60 * 1000;

/** فاصلهٔ بررسی بی‌فعالیتی در کامپوننت: هر ۳۰ ثانیه. */
export const IDLE_CHECK_INTERVAL_MS = 30 * 1000;

/** کمترین فاصلهٔ میان دو ثبت فعالیت در localStorage (جلوگیری از نوشتن مداوم). */
export const IDLE_ACTIVITY_THROTTLE_MS = 30 * 1000;

/** کلید localStorage برای آخرین فعالیت — بین تب‌های یک مرورگر مشترک است. */
export const IDLE_STORAGE_KEY = "saj_last_activity";

/**
 * آیا از آخرین فعالیت بیش از سقف مجاز گذشته است؟
 * مقدار نامعتبر/گم‌شده به‌معنای «منقضی نشده» است تا کاربر تازه‌واردشده
 * بی‌دلیل بیرون انداخته نشود؛ کامپوننت هنگام mount فعالیت را ثبت می‌کند.
 */
export function isIdleExpired(
  lastActivityMs: number | null | undefined,
  nowMs: number = Date.now(),
  timeoutMs: number = IDLE_TIMEOUT_MS,
): boolean {
  if (!Number.isFinite(lastActivityMs) || (lastActivityMs as number) <= 0) return false;
  return nowMs - (lastActivityMs as number) >= timeoutMs;
}

/** مقدار خام ذخیره‌شده را به میلی‌ثانیهٔ معتبر تبدیل می‌کند؛ در غیر این صورت null. */
export function parseLastActivity(raw: string | null): number | null {
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** آیا زمان ثبت تازهٔ فعالیت رسیده است (throttle)؟ */
export function shouldRecordActivity(
  lastRecordedMs: number | null | undefined,
  nowMs: number,
  throttleMs: number = IDLE_ACTIVITY_THROTTLE_MS,
): boolean {
  if (!Number.isFinite(lastRecordedMs) || (lastRecordedMs as number) <= 0) return true;
  return nowMs - (lastRecordedMs as number) >= throttleMs;
}

/** آخرین فعالیت ذخیره‌شده (مشترک بین تب‌ها)؛ در SSR یا حالت خصوصی null. */
export function readLastActivity(): number | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return parseLastActivity(window.localStorage.getItem(IDLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** ثبت «الان» به‌عنوان آخرین فعالیت. */
export function recordActivity(nowMs: number = Date.now()): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(IDLE_STORAGE_KEY, String(nowMs));
  } catch {
    // localStorage در دسترس نیست (حالت خصوصی و...) — بی‌فعالیتی فقط در حافظهٔ تب ردیابی می‌شود
  }
}
