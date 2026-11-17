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

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (isPublic(pathname)) {
    return NextResponse.next();
  }
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const payload = await verifyToken(token ?? "");
  if (!payload) {
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 })
      : NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + req.nextUrl.search)}`, req.url));
    // کوکی خراب را پاک کن تا حلقهٔ هدایت نسازد
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
  // مسیر فعلی را در هدر درخواست بگذار تا layout و صفحات سرور
  // هنگام نبود نشست، به /login?next=<همین مسیر> برگردند.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname + req.nextUrl.search);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
