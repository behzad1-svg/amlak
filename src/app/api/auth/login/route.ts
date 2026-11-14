import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken } from "@/lib/auth";
import { COOKIE_NAME, authCookieOptions } from "@/lib/jwt";
import { loginSchema } from "@/lib/validation";
import { checkRateLimitDb, recordRateLimitDb } from "@/lib/rateLimitDb";
import { serializeBigInt } from "@/lib/utils";

// توجه: محدودیت نرخ ورود با جدول RateLimitHit در دیتابیس ذخیره می‌شود (نقد ۱۳)
// تا بین نمونه‌های سرورلس هم مشترک باشد؛ اگر جدول نباشد، به محدودیت
// درون‌حافظه‌ای برمی‌گردد.
//
// فقط تلاش‌های ناموفق شمرده می‌شوند: اول سطل‌ها چک می‌شوند (بدون ثبت)،
// و فقط در صورت شکست احراز هویت یک ضربه ثبت می‌شود — پس لاگین‌های موفق هرگز
// باعث 429 نمی‌شوند. دو سطل جداگانه هست: هر IP و هر شماره تماس، هر کدام ۵ تلاش در ۱۵ دقیقه.
//
// سطل IP فقط وقتی فعال است که TRUSTED_PROXY=true باشد — یعنی وقتی پشت یک
// reverse-proxy معتبر هستیم و می‌توان به x-forwarded-for اعتماد کرد.
// در حالت پیش‌فرض، XFF نادیده گرفته می‌شود چون قابل جعل است و در route handler
// نکست هیچ IP مستقیمی از اتصال در دسترس نیست؛ در این حالت فقط سطل هر شماره
// تماس اعمال می‌شود.

function clientIp(req: NextRequest): string | null {
  if (process.env.TRUSTED_PROXY !== "true") return null;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone, password } = parsed.data;

  const ip = clientIp(req);
  const [ipAllowed, phoneAllowed] = await Promise.all([
    ip ? checkRateLimitDb(`login:ip:${ip}`) : Promise.resolve(true),
    checkRateLimitDb(`login:phone:${phone}`),
  ]);
  if (!ipAllowed || !phoneAllowed) {
    return NextResponse.json({ error: "تعداد تلاش بیش از حد مجاز، لطفا بعدا تلاش کنید" }, { status: 429 });
  }

  const recordFailure = () => {
    // fire-and-forget؛ شکستِ ثبتِ محدودیت نباید جلوی پاسخ 401 را بگیرد
    if (ip) void recordRateLimitDb(`login:ip:${ip}`);
    void recordRateLimitDb(`login:phone:${phone}`);
  };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    recordFailure();
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    recordFailure();
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });

  const res = NextResponse.json(serializeBigInt({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } }));
  res.cookies.set(COOKIE_NAME, token, authCookieOptions());
  return res;
}
