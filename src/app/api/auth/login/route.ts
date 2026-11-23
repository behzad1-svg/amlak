import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken } from "@/lib/auth";
import { COOKIE_NAME, authCookieOptions } from "@/lib/jwt";
import { loginSchema } from "@/lib/validation";
import { checkRateLimitDb, cleanupExpiredRateLimitDb, clearRateLimitDb, ipRateLimitKey, phoneOnlyRateLimitKey, phoneRateLimitKey, recordRateLimitDb, rateLimitForKey } from "@/lib/rateLimitDb";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { serializeBigInt, toEnDigits } from "@/lib/utils";

// توجه: محدودیت نرخ ورود با جدول RateLimitHit در دیتابیس ذخیره می‌شود (نقد ۱۳)
// تا بین نمونه‌های سرورلس هم مشترک باشد؛ اگر جدول نباشد، به محدودیت
// درون‌حافظه‌ای برمی‌گردد.
//
// فقط تلاش‌های ناموفق شمرده می‌شوند: اول سطل‌ها چک می‌شوند (بدون ثبت)،
// و فقط در صورت شکست احراز هویت یک ضربه ثبت می‌شود — پس لاگین‌های موفق هرگز
// باعث 429 نمی شوند. دو سطل جداگانه هست: هر IP بیست تلاش و هر شماره تماس از هر IP پنج تلاش در ۱۵ دقیقه دارد.
//
// سطل IP فقط وقتی فعال است که TRUSTED_PROXY=true باشد — یعنی وقتی پشت یک
// reverse-proxy معتبر هستیم و می‌توان به x-forwarded-for اعتماد کرد.
// در حالت پیش‌فرض، XFF نادیده گرفته می‌شود چون قابل جعل است و در route handler
// نکست هیچ IP مستقیمی از اتصال در دسترس نیست؛ در این حالت فقط سطل هر شماره
// تماس اعمال می‌شود.

function clientIp(req: NextRequest): string | null {
  return clientIpFromHeaders(req.headers);
}

// هش ساختگی با هزینهٔ یکسان (۱۰) برای هم‌زمان‌سازی پاسخ کاربر ناموجود یا
// غیرفعال با مسیر رمز اشتباه — تا زمان پاسخ، وجود یا نبود کاربر را لو ندهد.
// مقدار، هش bcrypt رشته‌ای است که هیچ رمزی با آن مطابقت نمی‌کند.
const DUMMY_PASSWORD_HASH =
  "$2b$10$3.czmHD7N9xqss6oLOcsF.BbQUAUKTw/F5GLBXRNmHdIab.D2N/hO";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  // ارقام فارسی/عربی شماره تماس پیش از اعتبارسنجی به لاتین تبدیل می شوند تا
  // «۰۹۱۷…» هم درست lookup شود و سطل rate-limit با شماره نرمال شده کلید بخورد
  if (body && typeof body.phone === "string") {
    body.phone = toEnDigits(body.phone);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone, password } = parsed.data;

  const ip = clientIp(req);
  const ipKey = ip ? ipRateLimitKey(ip) : null;
  const phoneKey = phoneRateLimitKey(phone, ip);
  // سطل صرف تلفن — مستقل از IP، تا چرخش IP سقف ۵ تایی شماره را دور نزند.
  const phoneOnlyKey = phoneOnlyRateLimitKey(phone);
  const [ipAllowed, phoneAllowed, phoneOnlyAllowed] = await Promise.all([
    ipKey ? checkRateLimitDb(ipKey) : Promise.resolve(true),
    checkRateLimitDb(phoneKey),
    checkRateLimitDb(phoneOnlyKey),
  ]);
  if (!ipAllowed || !phoneAllowed || !phoneOnlyAllowed) {
    return NextResponse.json({ error: "تعداد تلاش بیش از حد مجاز است، لطفاً ۱۵ دقیقهٔ دیگر تلاش کنید" }, { status: 429 });
  }

  // ثبت شکست به‌صورت اتمیک و تصمیم 429 بر اساس تعداد پس از افزایش:
  // اگر دو درخواست هم‌زمان هر دو از چک اول عبور کنند، افزایش اتمیک جلوی
  // از دست رفتن شمارش را می‌گیرد و هر درخواستی که شمارنده را از سقف
  // رد کند، 429 می‌گیرد.
  const recordFailure = async (): Promise<boolean> => {
    const [ipCount, phoneCount, phoneOnlyCount] = await Promise.all([
      ipKey ? recordRateLimitDb(ipKey) : Promise.resolve(0),
      recordRateLimitDb(phoneKey),
      recordRateLimitDb(phoneOnlyKey),
    ]);
    return (
      (ipKey ? ipCount > rateLimitForKey(ipKey) : false) ||
      phoneCount > rateLimitForKey(phoneKey) ||
      phoneOnlyCount > rateLimitForKey(phoneOnlyKey)
    );
  };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    // مقایسهٔ ساختگی با همان هزینهٔ bcrypt تا زمان پاسخ با مسیر رمز اشتباه یکی باشد
    await verifyPassword(password, DUMMY_PASSWORD_HASH);
    if (await recordFailure()) {
      return NextResponse.json({ error: "تعداد تلاش بیش از حد مجاز است، لطفاً ۱۵ دقیقهٔ دیگر تلاش کنید" }, { status: 429 });
    }
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    if (await recordFailure()) {
      return NextResponse.json({ error: "تعداد تلاش بیش از حد مجاز است، لطفاً ۱۵ دقیقهٔ دیگر تلاش کنید" }, { status: 429 });
    }
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });

  // ورود موفق: فقط شمارندهٔ خطاهای همان شماره پاک می‌شود تا چند خطای قدیمی باعث 429 نشوند؛
  // کلید ساده تلفن هم پاک می شود تا سطل های قدیمی (پیش از ترکیب کلید) باقی نمانند،
  // و سطل صرف تلفن هم تا حدس‌های ناموفقِ پیشین شماره را قفل نکند.
  // سطل IP عمداً پاک نمی‌شود: دفتر یک IP مشترک دارد و پاک‌کردنش با ورود هر همکار،
  // سهمیهٔ تلاش مهاجمِ در حال حدس رمز را هم صفر می‌کرد.
  await clearRateLimitDb(phoneKey, `login:phone:${phone}`, phoneOnlyKey);
  // پاک‌سازی فرصت‌طلبانهٔ ردیف‌های منقضی — خرابی‌اش ورود را خراب نمی‌کند
  void cleanupExpiredRateLimitDb();

  const res = NextResponse.json(serializeBigInt({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } }));
  res.cookies.set(COOKIE_NAME, token, authCookieOptions());
  return res;
}
