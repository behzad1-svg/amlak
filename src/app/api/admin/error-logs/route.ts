// نقد ۶ — لاگ خطاهای سرور برای مدیر.
// اگر جدول ApiErrorLog هنوز در دیتابیس ساخته نشده باشد، به‌جای ۵۰۰
// { logs: [], unavailable: true } برمی‌گردد تا صفحهٔ مدیر نایستد.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند لاگ را ببیند" }, { status: 403 });
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  try {
    const logs = await prisma.apiErrorLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: [], unavailable: true });
  }
}
