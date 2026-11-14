// نقد ۶ — ثبت ساخت‌یافتهٔ خطاهای API در جدول ApiErrorLog (قابل مشاهده برای مدیر).
// اگر جدول در دیتابیس نباشد (مهاجرت اجرا نشده)، به console.error برمی‌گردد
// و هیچ خطایی پرتاب نمی‌کند تا مسیر اصلی برنامه هیچ‌وقت به‌خاطر لاگ نایستد.
import { prisma } from "@/lib/prisma";

export async function logApiError(input: {
  route: string;
  method: string;
  status: number;
  message: string;
  userId?: string | null;
}): Promise<void> {
  const entry = `[API-ERROR] ${input.method} ${input.route} ${input.status} ${input.message}`;
  try {
    await prisma.apiErrorLog.create({
      data: {
        route: input.route.slice(0, 200),
        method: input.method.slice(0, 16),
        status: input.status,
        message: input.message.slice(0, 1000),
        userId: input.userId ?? null,
      },
    });
  } catch (e) {
    // جدول نیست یا دیتابیس در دسترس نیست — لاگ ساخت‌یافته در کنسول سرور می‌ماند
    console.error(entry, e instanceof Error ? e.message : "");
  }
}
