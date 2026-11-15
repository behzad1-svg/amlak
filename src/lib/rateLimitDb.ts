// نقد ۱۳ — محدودیت نرخ ورود با پشتوانهٔ دیتابیس (جدول RateLimitHit).
// اگر جدول نباشد، به محدودیت درون‌حافظه‌ای برمی‌گردد تا ورود هیچ‌وقت قفل نشود.
// پنجره: ۱۵ دقیقه؛ سقف: ۲۰ تلاش ناموفق برای هر IP (دفتر مشترک) و ۵ تلاش برای هر شماره تماس.
// فقط تلاش‌های ناموفق شمرده می‌شوند: اول سطل‌ها چک می‌شوند (بدون ثبت)،
// و فقط در صورت شکست احراز هویت یک ضربه ثبت می‌شود.
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_IP = 20;
const MAX_ATTEMPTS_PHONE = 5;

/** سقف هر کلید: کلیدهای IP (login:ip:...) بیست تلاش، بقیه (شماره تماس) پنج تلاش. */
function limitForKey(key: string): number {
  return key.startsWith("login:ip:") ? MAX_ATTEMPTS_IP : MAX_ATTEMPTS_PHONE;
}

// Fallback درون‌حافظه‌ای — فقط وقتی جدول در دسترس نیست
const mem = new Map<string, { count: number; resetAt: number }>();

function memCheck(key: string): boolean {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || now > cur.resetAt) return true;
  return cur.count < limitForKey(key);
}

function memRecord(key: string): void {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || now > cur.resetAt) {
    mem.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  cur.count += 1;
}

/** چک بدون ثبت: آیا این کلید هنوز زیر سقف است؟ */
export async function checkRateLimitDb(key: string): Promise<boolean> {
  try {
    const rec = await prisma.rateLimitHit.findUnique({ where: { key } });
    if (!rec) return true;
    if (Date.now() - rec.windowStart.getTime() > WINDOW_MS) return true;
    return rec.count < limitForKey(key);
  } catch (e) {
    console.error("[rate-limit] DB check fallback to memory:", e instanceof Error ? e.message : "");
    return memCheck(key);
  }
}

/** ثبت یک تلاش ناموفق (فقط در صورت شکست احراز هویت صدا می‌شود). */
export async function recordRateLimitDb(key: string): Promise<void> {
  const now = new Date();
  try {
    const rec = await prisma.rateLimitHit.findUnique({ where: { key } });
    if (!rec || now.getTime() - rec.windowStart.getTime() > WINDOW_MS) {
      await prisma.rateLimitHit.upsert({
        where: { key },
        update: { windowStart: now, count: 1 },
        create: { key, windowStart: now, count: 1 },
      });
      return;
    }
    await prisma.rateLimitHit.update({ where: { key }, data: { count: rec.count + 1 } });
  } catch (e) {
    console.error("[rate-limit] DB record fallback to memory:", e instanceof Error ? e.message : "");
    memRecord(key);
  }
}
