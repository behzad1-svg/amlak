import { NextResponse, type NextRequest } from "next/server";
import { getSessionFromCookies, invalidateUserTokens, COOKIE_NAME_EXPORT } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  let idle = false;
  try {
    const body = await req.json();
    idle = body?.idle === true;
  } catch {
    // بدون بدنه (خروج دستی) — رفتار قبلی
  }

  // خروج بی‌فعالیتی (idle) فقط کوکی همین مرورگر را پاک می‌کند و نشست‌های
  // دستگاه‌های دیگر را باطل نمی‌کند؛ خروج دستی مثل قبل همهٔ توکن‌ها را
  // با tokenVersion باطل می‌کند.
  if (!idle && session?.user?.id) {
    try {
      await invalidateUserTokens(session.user.id);
    } catch (e) {
      console.error("logout tokenVersion increment failed", e);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME_EXPORT);
  return res;
}
