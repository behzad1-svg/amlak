// بازیابی رمز با پیامک — مرحلهٔ ۲: بررسی کد ۶ رقمی.
// خطای کد اشتباه، کد منقضی و کد ناموجود یکی است تا چیزی لو نرود؛
// پس از ۵ تلاش ناموفق کد باطل می‌شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { forgotPasswordVerifySchema } from "@/lib/validation";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { toEnDigits } from "@/lib/utils";
import {
  FORGOT_RATE_LIMIT_MESSAGE,
  RESET_CODE_MAX_ATTEMPTS,
  checkForgotRateLimit,
  forgotRateLimitKeys,
  recordForgotAttempt,
} from "@/lib/passwordReset";

const WRONG_CODE_MESSAGE = "کد اشتباه است یا منقضی شده است — دوباره درخواست بدهید.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body && typeof body.phone === "string") body.phone = toEnDigits(body.phone);
  const parsed = forgotPasswordVerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { phone, code } = parsed.data;

  const keys = forgotRateLimitKeys(phone, clientIpFromHeaders(req.headers));
  if (!(await checkForgotRateLimit(keys))) {
    return NextResponse.json({ error: FORGOT_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const fail = async () => {
    if (await recordForgotAttempt(keys)) {
      return NextResponse.json({ error: FORGOT_RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return NextResponse.json({ error: WRONG_CODE_MESSAGE }, { status: 400 });
  };

  const row = await prisma.passwordResetCode.findUnique({ where: { phone } });
  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) await prisma.passwordResetCode.delete({ where: { phone } }).catch(() => {});
    return fail();
  }
  if (row.attempts >= RESET_CODE_MAX_ATTEMPTS) {
    await prisma.passwordResetCode.delete({ where: { phone } }).catch(() => {});
    return fail();
  }
  const ok = await verifyPassword(code, row.codeHash);
  if (!ok) {
    const attempts = row.attempts + 1;
    if (attempts >= RESET_CODE_MAX_ATTEMPTS) {
      await prisma.passwordResetCode.delete({ where: { phone } }).catch(() => {});
    } else {
      await prisma.passwordResetCode.update({ where: { phone }, data: { attempts } });
    }
    return fail();
  }
  await prisma.passwordResetCode.update({ where: { phone }, data: { verifiedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
