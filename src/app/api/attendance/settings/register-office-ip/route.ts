// ثبت آی‌پی فعلی به‌عنوان آی‌پی دفتر — آی‌پی‌ای که سرور برای این درخواست
// می‌بیند (فقط X-Real-IP، از clientIpFromHeaders) برگردانده می‌شود و در
// پیش‌نویس تنظیمات می‌نشیند؛ ذخیرهٔ نهایی با دکمهٔ «ذخیره تنظیمات» است —
// مثل دکمهٔ «ثبت موقعیت فعلی به‌عنوان دفتر». فقط مدیر. چیزی در دیتابیس
// نمی‌نویسد، پس اگر مدیر از شبکهٔ اشتباه بزند، آی‌پی اشتباه ذخیره نمی‌شود.
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { clientIpFromHeaders } from "@/lib/clientIp";

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند آی‌پی دفتر را ثبت کند" }, { status: 403 });
  }
  const ip = clientIpFromHeaders(req.headers);
  if (!ip) {
    return NextResponse.json(
      { error: "آی‌پی شما خوانده نشد — مطمئن شوید با مرورگر و از اینترنت دفتر وارد شده‌اید." },
      { status: 400 }
    );
  }
  return NextResponse.json({ officeIp: ip });
}
