"use client";

import { useEffect, useRef } from "react";
import {
  IDLE_CHECK_INTERVAL_MS,
  IDLE_STORAGE_KEY,
  IDLE_TIMEOUT_MS,
  isIdleExpired,
  readLastActivity,
  recordActivity,
  shouldRecordActivity,
} from "@/lib/idleTimeout";

/** رویدادهایی که فعالیت کاربر شمرده می‌شوند. */
const ACTIVITY_EVENTS = ["pointerdown", "mousemove", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * خروج خودکار پس از ۲۰ دقیقه بی‌فعالیتی (بهزاد ۱۴۰۵/۰۹/۰۱).
 * در layout داشبورد سوار می‌شود، پس روی همهٔ صفحه‌های واردشده فعال است و
 * روی صفحهٔ ورود نیست. چیزی رندر نمی‌کند.
 * آخرین فعالیت در localStorage مشترک بین تب‌هاست، پس فعالیت در یک تب،
 * تب‌های دیگر را هم زنده نگه می‌دارد.
 */
export function IdleLogout() {
  const lastRecordedRef = useRef<number>(0);
  const lastActivityRef = useRef<number>(Date.now());
  const loggingOutRef = useRef(false);

  useEffect(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    lastRecordedRef.current = now;
    recordActivity(now);

    const doLogout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        // خروج بی‌فعالیتی: فقط کوکی همین مرورگر پاک می‌شود؛ نشست‌های
        // دستگاه‌های دیگر دست نخورده می‌مانند (برخلاف خروج دستی که همهٔ
        // توکن‌ها را با tokenVersion باطل می‌کند).
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idle: true }),
        });
      } catch {
        // حتی اگر درخواست نرسد، به صفحهٔ ورود برو؛ پروکسی نشست را بررسی می‌کند
      } finally {
        const next = window.location.pathname + window.location.search;
        window.location.replace(`/login?next=${encodeURIComponent(next)}`);
      }
    };

    const checkIdle = () => {
      if (loggingOutRef.current) return;
      const stored = readLastActivity();
      const last = Math.max(lastActivityRef.current, stored ?? 0);
      if (isIdleExpired(last, Date.now(), IDLE_TIMEOUT_MS)) {
        void doLogout();
      }
    };

    const noteActivity = () => {
      const at = Date.now();
      lastActivityRef.current = at;
      if (shouldRecordActivity(lastRecordedRef.current, at)) {
        lastRecordedRef.current = at;
        recordActivity(at);
      }
    };

    // فعالیت در تب دیگر (رویداد storage) هم این تب را زنده نگه می‌دارد
    const onStorage = (e: StorageEvent) => {
      if (e.key === IDLE_STORAGE_KEY) {
        const at = e.newValue ? Number(e.newValue) : NaN;
        if (Number.isFinite(at) && at > 0) {
          lastActivityRef.current = Math.max(lastActivityRef.current, at);
        }
      }
    };

    // وقتی تب دوباره دیده می‌شود، بی‌درنگ بررسی کن (تایمر در تب مخفی کند می‌شود)
    const onVisibility = () => {
      if (!document.hidden) checkIdle();
    };

    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, noteActivity, { passive: true }));
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(checkIdle, IDLE_CHECK_INTERVAL_MS);
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, noteActivity));
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
    // فقط یک بار هنگام mount — توابع داخلی عمداً در deps نیستند
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
