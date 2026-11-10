// Simple in-memory rate limiter (single-instance, per spec)
// For multi-instance deployment: switch to Redis or DB-backed storage
// محدودیت مستند: فقط با یک Instance درست کار می‌کند؛ برای چند instance باید به storage مشترک سوییچ شود.
const store = new Map<string, { count: number; resetAt: number }>();

// Check-only: آیا این کلید هنوز زیر سقف است؟ (بدون ثبت — برای چک قبل از احراز هویت)
export function checkRateLimit(key: string, max: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    return { allowed: true, remaining: max };
  }

  return { allowed: entry.count < max, remaining: Math.max(0, max - entry.count) };
}

// Record-only: یک تلاش ناموفق را ثبت کن (فقط در صورت شکست احراز هویت صدا می‌شود)
export function recordRateLimitHit(key: string, max: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  entry.count++;
  return { allowed: entry.count <= max, remaining: Math.max(0, max - entry.count) };
}

export function rateLimit(key: string, max: number, windowMs: number): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1 };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count };
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}
