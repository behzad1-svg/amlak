import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

// فقط برای اعتبارسنجی جلسه از داخل middleware استفاده می‌شود.
// middleware در Edge runtime است و نمی‌تواند مستقیم به دیتابیس وصل شود،
// پس این روت (Node runtime) همان validateSession را صدا می‌زند:
// امضا + tokenVersion + فعال بودن کاربر.
// هیچ داده‌ای برنمی‌گرداند، فقط 200 یا 401.
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true });
}
