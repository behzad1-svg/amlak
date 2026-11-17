// نقد ۱۳ — محدودیت نرخ ورود با پشتوانهٔ دیتابیس (جدول RateLimitHit).
// اگر جدول نباشد، به محدودیت درون‌حافظه‌ای برمی‌گردد تا ورود هیچ‌وقت قفل نشود.
// پنجره: ۱۵ دقیقه؛ سقف: ۲۰ تلاش ناموفق برای هر IP (دفتر مشترک) و ۵ تلاش برای هر شماره تماس از هر IP.
// فقط تلاش های ناموفق شمرده می شوند: اول سطل ها چک می شوند (بدون ثبت)،
// و فقط در صورت شکست احراز هویت یک ضربه ثبت می شود.
// سطل تلفن ترکیبی است (شماره + IP) تا تلاش ناموفق از یک IP، شماره یک مشاور
// را برای بقیه قفل نکند؛ سطل صرف IP تنگ نمی شود (دفتر یک IP مشترک دارد).
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS_IP = 20;
const MAX_ATTEMPTS_PHONE = 5;

/** سقف هر کلید: کلیدهای IP (login:ip:...) بیست تلاش، بقیه (شماره تماس، ساده یا ترکیبی با IP) پنج تلاش. */
export function rateLimitForKey(key: string): number {
  return key.startsWith("login:ip:") ? MAX_ATTEMPTS_IP : MAX_ATTEMPTS_PHONE;
}

/** کلید سطل IP: login:ip:<ip> — سقف ۲۰؛ دفتر یک IP مشترک دارد و تنگ نمی شود. */
export function ipRateLimitKey(ip: string): string {
  return `login:ip:${ip}`;
}

/**
 * کلید سطل تلفن: ترکیبی با IP — login:phone:<phone>:<ip> — تا تلاش های ناموفق
 * از یک IP، شماره همان مشاور را برای بقیه قفل نکند. وقتی IP در دسترس نیست
 * (TRUSTED_PROXY خاموش)، به کلید صرف تلفن برمی گردد.
 */
export function phoneRateLimitKey(phone: string, ip: string | null): string {
  return ip ? `login:phone:${phone}:${ip}` : `login:phone:${phone}`;
}

// Fallback درون‌حافظه‌ای — فقط وقتی جدول در دسترس نیست
const mem = new Map<string, { count: number; resetAt: number }>();

// جاروکنندهٔ دوره‌ای ورودی‌های منقضی — تا fallback در غیاب جدول بی‌مرز رشد نکند.
const memSweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of mem) if (now > v.resetAt) mem.delete(k);
}, 60_000);
// unref تا تایمر پروسه را باز نگه ندارد
if (typeof (memSweeper as unknown as { unref?: unknown }).unref === "function") {
  (memSweeper as unknown as { unref: () => void }).unref();
}

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
    // یک دستور اتمیک INSERT ... ON CONFLICT: در پنجرهٔ زنده +۱،
    // در پنجرهٔ منقضی شمارش از ۱ شروع می‌شود — دو درخواست هم‌زمان دیگر
    // نمی‌توانند هر دو پنجرهٔ تازه با تعداد ۱ بسازند و یک ضربه گم شود.
    const threshold = new Date(now.getTime() - WINDOW_MS);
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitHit" ("key", "windowStart", "count", "updatedAt")
      VALUES (${key}, ${now}, 1, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimitHit"."windowStart" >= ${threshold}
          THEN "RateLimitHit"."count" + 1 ELSE 1 END,
        "windowStart" = CASE WHEN "RateLimitHit"."windowStart" >= ${threshold}
          THEN "RateLimitHit"."windowStart" ELSE ${now} END,
        "updatedAt" = ${now}
      RETURNING "count"
    `;
    return rows[0]?.count ?? rateLimitForKey(key) + 1;
  } catch (e) {
    console.error("[rate-limit] DB record fallback to memory:", e instanceof Error ? e.message : "");
    return memRecord(key);
  }
}

/** پاک‌سازی دوره‌ای ردیف‌های منقضی‌شدهٔ جدول — فرصت‌طلبانه روی ورود موفق صدا می‌شود
 *  تا جدول با کلیدهای مرده بی‌مرز رشد نکند (هر کلید یک ردیف دارد، ولی کلیدهای
 *  ناموفقِ همیشگی برای همیشه می‌ماندند). */
export async function cleanupExpiredRateLimitDb(): Promise<void> {
  try {
    await prisma.rateLimitHit.deleteMany({ where: { windowStart: { lt: new Date(Date.now() - WINDOW_MS) } } });
  } catch (e) {
    console.error("[rate-limit] DB cleanup failed:", e instanceof Error ? e.message : "");
  }
}

/** پاک‌کردن شمارندهٔ تلاش‌های ناموفق — بعد از ورود موفق صدا می‌شود. */
export async function clearRateLimitDb(...keys: string[]): Promise<void> {
  for (const key of keys) mem.delete(key);
  if (keys.length === 0) return;
  try {
    await prisma.rateLimitHit.deleteMany({ where: { key: { in: keys } } });
  } catch (e) {
    console.error("[rate-limit] DB clear failed:", e instanceof Error ? e.message : "");
  }
}
