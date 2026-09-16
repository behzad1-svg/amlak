// Simple in-memory rate limiter (single-instance, per spec)
// For multi-instance deployment: switch to Redis or DB-backed storage
// محدودیت مستند: فقط با یک Instance درست کار می‌کند؛ برای چند instance باید به storage مشترک سوییچ شود.
const store = new Map<string, { count: number; resetAt: number }>();

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
