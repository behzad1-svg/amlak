import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret, COOKIE_NAME } from "@/lib/jwt";

const publicPaths = ["/login", "/api/auth/login", "/api/health", "/api/auth/verify"];

function unauthorized(req: NextRequest, message: string, deleteCookie = false) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    const res = NextResponse.json({ error: message }, { status: 401 });
    if (deleteCookie) res.cookies.delete(COOKIE_NAME);
    return res;
  }
  const res = NextResponse.redirect(new URL("/login", req.url));
  if (deleteCookie) res.cookies.delete(COOKIE_NAME);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return unauthorized(req, "وارد نشده‌اید");

  // ۱) فقط امضای توکن — در Edge runtime
  try {
    await jwtVerify(token, getJwtSecret());
  } catch {
    return unauthorized(req, "توکن نامعتبر", true);
  }

  // ۲) چک ابطال توکن + فعال بودن کاربر — با همان قانون validateSession در src/lib/auth.ts.
  // middleware در Next 16 هنوز در Edge runtime اجرا می‌شود و Prisma در Edge کار نمی‌کند
  // (تست شد: PrismaClient is not configured to run in Edge Runtime)، پس اعتبارسنجی
  // کامل جلسه به روت داخلی /api/auth/verify سپرده می‌شود که در Node runtime است.
  // اگر روت در دسترس نباشد، fail-closed: 401.
  try {
    const verifyRes = await fetch(new URL("/api/auth/verify", req.url), {
      headers: { cookie: req.headers.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!verifyRes.ok) return unauthorized(req, "توکن نامعتبر", true);
    return NextResponse.next();
  } catch {
    return unauthorized(req, "توکن نامعتبر", true);
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
