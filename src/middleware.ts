import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set — refusing to start with insecure fallback");
  return new TextEncoder().encode(secret);
}

const publicPaths = ["/login", "/api/auth/login", "/api/health"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (publicPaths.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return NextResponse.next();

  const token = req.cookies.get("saj_token")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", req.url));
  }
  try {
    await jwtVerify(token, getJwtSecret());
    return NextResponse.next();
  } catch {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "توکن نامعتبر" }, { status: 401 });
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("saj_token");
    return res;
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
