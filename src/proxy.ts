// نقد ۸ — جایگزین middleware.ts (در Next 16 منسوخ و به proxy تغییر نام داده).
// پروکسی فقط امضای JWT را بررسی می‌کند (jose خالص جاوااسکریپت است)؛
// بررسی لغو نشست (tokenVersion) و فعال‌بودن کاربر با دیتابیس در layout
// داشبورد و همهٔ مسیرهای API است، چون موتور نیتیو Prisma
// (فایل .so) در باندل پروکسی قابل استفاده نیست؛ دیپلوی مستقیم روی VPS
// با deploy.sh است، نه Netlify.
// پس این پروکسی «دروازهٔ اول» است، نه تنها لایهٔ احراز هویت: توکنِ لغوشده
// (مثلاً بعد از logout) از اینجا رد می‌شود ولی layout/API آن را 401 می‌کنند.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME } from "./lib/jwt";
import { isForeignOrigin, needsOriginCheck } from "./lib/csrf";

// مسیرهای عمومی — تطبیق دقیق یا بر اساس سگمنت، نه startsWith
// /api/cron/reminders اینجا عمومی است چون خودش با CRON_SECRET احراز هویت می‌کند.
// /api/admin/backup-log هم عمومی است چون POST آن با CRON_SECRET احراز هویت می‌کند (ثبت پشتیبان شبانه)؛ GET آن خودش نشست OWNER می‌خواهد.
// (با startsWith، مسیر /loginXYZ هم عمومی محسوب می‌شد).
const PUBLIC_EXACT = new Set(["/login", "/api/health", "/robots.txt", "/api/cron/reminders", "/api/admin/backup-log", "/saj-logo.png", "/saj-logo-mark.png", "/icon.png", "/apple-touch-icon.png", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png"]);
const PUBLIC_API_PREFIXES = ["/api/auth/login"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return false;
}

// CSP با nonce به‌جای 'unsafe-inline' در script-src — الگوی رسمی Next.js:
// پروکسی برای هر درخواست یک nonce تازه می‌سازد و آن را در هدر CSPِ درخواست
// می‌گذارد تا Next.js هنگام SSR خودش nonce را به اسکریپت‌های فریم‌ورک بزند،
// در هدر x-nonce می‌گذارد تا layout آن را به اسکریپت تم بدهد، و همان CSP را
// در هدر پاسخ می‌گذارد تا مرورگر اجرا کند. 'strict-dynamic' جای 'unsafe-inline'
// را می‌گیرد: اسکریپت‌های دارای nonce می‌توانند اسکریپت‌های دیگر را بار کنند.
// style-src دیگر 'unsafe-inline' ندارد: experimental.inlineCss خاموش است و استایل
// به‌جای تگ <style> به‌صورت فایل جداگانه می‌آید. style-src-attr هم حذف شد:
// چهار استفادهٔ inline style به کلاس تبدیل شد (بج فایل‌ها، نوار پیشرفت گزارش‌ها،
// الگوی نقطه‌ای لاگین، عرض سایدبار).
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
    "worker-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };
  // بررسی مبدأ برای درخواست‌های تغییردهندهٔ API (لایهٔ اول CSRF):
  // اگر Origin/Referer آمده و با مبدأ سایت نمی‌خواند، 403 بده.
  // وقتی هدر نیست (مثلاً cron با curl) رد نمی‌شود.
  if (needsOriginCheck(req.method, pathname) && isForeignOrigin(req.headers.get("origin"), req.headers.get("referer"), req.nextUrl.origin)) {
    return withCsp(NextResponse.json({ error: "مبدأ درخواست معتبر نیست" }, { status: 403 }));
  }
  if (isPublic(pathname)) {
    return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
  }
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = await verifyToken(token ?? "");
  if (!payload) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + req.nextUrl.search)}`, req.url));
    // کوکی خراب را پاک کن تا حلقهٔ هدایت نسازد
    res.cookies.delete(COOKIE_NAME);
    return withCsp(res);
  }
  // مسیر فعلی را در هدر درخواست بگذار تا layout و صفحات سرور
  // هنگام نبود نشست، به /login?next=<همین مسیر> برگردند.
  requestHeaders.set("x-pathname", pathname + req.nextUrl.search);
  return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
