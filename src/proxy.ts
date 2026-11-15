// نقد ۸ — جایگزین middleware.ts (در Next 16 منسوخ و به proxy تغییر نام داده).
// پروکسی فقط امضای JWT را بررسی می‌کند (jose خالص جاوااسکریپت است)؛
// بررسی لغو نشست (tokenVersion) و فعال‌بودن کاربر با دیتابیس در layout
// داشبورد و تک‌تک روت‌های API انجام می‌شود، چون Netlify/OpenNext موتور
// نیتیو Prisma (فایل .so) را در باندل Middleware قبول نمی‌کند و بیلد با
// «Usage of unsupported C++ Addon(s) found in Node.js Middleware» می‌شکست.
// پس این پروکسی «دروازهٔ اول» است، نه تنها لایهٔ احراز هویت: توکنِ لغوشده
// (مثلاً بعد از logout) از اینجا رد می‌شود ولی layout/API آن را 401 می‌کنند.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifyToken, COOKIE_NAME } from "./lib/jwt";

// مسیرهای عمومی — تطبیق دقیق یا بر اساس سگمنت، نه startsWith
// /api/cron/reminders اینجا عمومی است چون خودش با CRON_SECRET احراز هویت می‌کند.
// (با startsWith، مسیر /loginXYZ هم عمومی محسوب می‌شد).
const PUBLIC_EXACT = new Set(["/login", "/api/health", "/robots.txt", "/api/cron/reminders", "/saj-logo.png", "/saj-logo-mark.png"]);
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
      : NextResponse.redirect(new URL("/login", req.url));
    // کوکی خراب را پاک کن تا حلقهٔ هدایت نسازد
    res.cookies.delete(COOKIE_NAME);
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
