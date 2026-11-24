// بازیابی رمز با پیامک — ثابت‌ها و کمک‌های مشترک سه مسیر forgot-password
// (درخواست کد، بررسی کد، تنظیم رمز تازه).
import { randomInt } from "node:crypto";
import {
  checkRateLimitDb,
  forgotIpRateLimitKey,
  forgotPhoneOnlyRateLimitKey,
  forgotPhoneRateLimitKey,
  rateLimitForKey,
  recordRateLimitDb,
} from "./rateLimitDb";

/** اعتبار کد بازیابی: ۱۰ دقیقه. */
export const RESET_CODE_TTL_MS = 10 * 60 * 1000;
/** پس از این‌قدر تلاش ناموفق برای یک کد، کد باطل می‌شود. */
export const RESET_CODE_MAX_ATTEMPTS = 5;

/** کد ۶ رقمی تصادفی — صفر اول ندارد (۱۰۰۰۰۰ تا ۹۹۹۹۹۹). */
export function generateResetCode(): string {
  return String(randomInt(100000, 1000000));
}

export interface ForgotRateLimitKeys {
  ipKey: string | null;
  phoneKey: string;
  phoneOnlyKey: string;
}

export function forgotRateLimitKeys(phone: string, ip: string | null): ForgotRateLimitKeys {
  return {
    ipKey: ip ? forgotIpRateLimitKey(ip) : null,
    phoneKey: forgotPhoneRateLimitKey(phone, ip),
    phoneOnlyKey: forgotPhoneOnlyRateLimitKey(phone),
  };
}

/** چک بدون ثبت: آیا هر سه سطل هنوز زیر سقف‌اند؟ */
export async function checkForgotRateLimit(keys: ForgotRateLimitKeys): Promise<boolean> {
  const [ipAllowed, phoneAllowed, phoneOnlyAllowed] = await Promise.all([
    keys.ipKey ? checkRateLimitDb(keys.ipKey) : Promise.resolve(true),
    checkRateLimitDb(keys.phoneKey),
    checkRateLimitDb(keys.phoneOnlyKey),
  ]);
  return ipAllowed && phoneAllowed && phoneOnlyAllowed;
}

/** ثبت یک ضربه در هر سه سطل؛ true یعنی دست‌کم یک سطل از سقف رد شد. */
export async function recordForgotAttempt(keys: ForgotRateLimitKeys): Promise<boolean> {
  const [ipCount, phoneCount, phoneOnlyCount] = await Promise.all([
    keys.ipKey ? recordRateLimitDb(keys.ipKey) : Promise.resolve(0),
    recordRateLimitDb(keys.phoneKey),
    recordRateLimitDb(keys.phoneOnlyKey),
  ]);
  return (
    (keys.ipKey ? ipCount > rateLimitForKey(keys.ipKey) : false) ||
    phoneCount > rateLimitForKey(keys.phoneKey) ||
    phoneOnlyCount > rateLimitForKey(keys.phoneOnlyKey)
  );
}

export const FORGOT_RATE_LIMIT_MESSAGE = "تعداد تلاش بیش از حد مجاز است، لطفاً ۱۵ دقیقهٔ دیگر تلاش کنید";
