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
export function rateLimitForKey(key: string): number {
  return key.startsWith("login:ip:") ? MAX_ATTEMPTS_IP : MAX_ATTEMPTS_PHONE;
}

// Fallback درون‌حافظه‌ای — فقط وقتی جدول در دسترس نیست
const mem = new Map<string, { count: number; resetAt: number }>();

function memCheck(key: string): boolean {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || now > cur.resetAt) return true;
  return cur.count < rateLimitForKey(key);
}

/** ثبت در حافظه و برگرداندن تعداد تازه. */
function memRecord(key: string): number {
  const now = Date.now();
  const cur = mem.get(key);
  if (!cur || now > cur.resetAt) {
    mem.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return 1;
  }
  cur.count += 1;
  return cur.count;
}

/** چک بدون ثبت: آیا این کلید هنوز زیر سقف است؟ */
export async function checkRateLimitDb(key: string): Promise<boolean> {
  try {
    const rec = await prisma.rateLimitHit.findUnique({ where: { key } });
    if (!rec) return true;
    if (Date.now() - rec.windowStart.getTime() > WINDOW_MS) return true;
    return rec.count < rateLimitForKey(key);
  } catch (e) {
    console.error("[rate-limit] DB check fallback to memory:", e instanceof Error ? e.message : "");
    return memCheck(key);
  }
}

/** ثبت یک تلاش ناموفق (فقط در صورت شکست احراز هویت صدا می‌شود) و برگرداندن تعداد تازه. */
export async function recordRateLimitDb(key: string): Promise<number> {
  const now = new Date();
  try {
    // افزایش اتمیک در پنجرهٔ زنده: دو درخواست هم‌زمان دیگر نمی‌توانند هر دو
    // تعداد را ۴ بخوانند و هر دو ۵ بنویسند.
    const threshold = new Date(now.getTime() - WINDOW_MS);
    const updated = await prisma.rateLimitHit.updateMany({
      where: { key, windowStart: { gte: threshold } },
      data: { count: { increment: 1 } },
    });
    if (updated.count > 0) {
      const rec = await prisma.rateLimitHit.findUnique({ where: { key } });
      return rec ? rec.count : rateLimitForKey(key) + 1;
    }
    // ردیفی نیست یا پنجره منقضی شده: پنجرهٔ تازه با تعداد ۱.
    const rec = await prisma.rateLimitHit.upsert({
      where: { key },
      update: { windowStart: now, count: 1 },
      create: { key, windowStart: now, count: 1 },
    });
    return rec.count;
  } catch (e) {
    console.error("[rate-limit] DB record fallback to memory:", e instanceof Error ? e.message : "");
    return memRecord(key);
  }
}
