// بازیابی رمز با پیامک — مرحلهٔ ۱: درخواست کد برای شمارهٔ ثبت‌شده.
// پاسخ همیشه یکسان است تا وجود یا نبود شماره لو نرود؛ کد فقط وقتی
// ارسال می‌شود که کاربر فعال با آن شماره وجود داشته باشد.
// هر درخواست کد یک ضربه در سطل‌های محدودیت می‌خورد (هزینهٔ پیامک) —
// برخلاف ورود که فقط تلاش ناموفق شمرده می‌شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";
import { forgotPasswordRequestSchema } from "@/lib/validation";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { toEnDigits } from "@/lib/utils";
import {
  FORGOT_RATE_LIMIT_MESSAGE,
  RESET_CODE_TTL_MS,
  checkForgotRateLimit,
  forgotRateLimitKeys,
  generateResetCode,
  recordForgotAttempt,
} from "@/lib/passwordReset";
import { sendVerificationCode, smsVerifyTemplateId } from "@/lib/sms";

const GENERIC_MESSAGE = "اگر شماره‌ای در سامانه ثبت شده باشد، کد بازیابی پیامک می‌شود.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body && typeof body.phone === "string") body.phone = toEnDigits(body.phone);
  const parsed = forgotPasswordRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { phone } = parsed.data;

  const keys = forgotRateLimitKeys(phone, clientIpFromHeaders(req.headers));
  if (!(await checkForgotRateLimit(keys))) {
    return NextResponse.json({ error: FORGOT_RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  await recordForgotAttempt(keys);

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const code = generateResetCode();
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
  await prisma.passwordResetCode.upsert({
    where: { phone },
    update: { codeHash, expiresAt, attempts: 0, verifiedAt: null },
    create: { phone, codeHash, expiresAt },
  });

  // پترن تایید در پنل SMS.ir هنوز ساخته/تایید نشده باشد، ارسال ممکن نیست؛
  // خطا فقط در لاگ سرور می‌ماند و پاسخ همان پاسخ عمومی است.
  if (smsVerifyTemplateId() === null) {
    console.error("[forgot-password] SMS_IR_VERIFY_TEMPLATE_ID is not configured — recovery code was NOT sent");
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }
  try {
    await sendVerificationCode(phone, code);
  } catch (e) {
    // کد ذخیره شده ولی پیامک نرسید؛ کاربر می‌تواند دوباره درخواست بدهد.
    console.error("[forgot-password] SMS send failed:", e instanceof Error ? e.message : "");
  }
  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
