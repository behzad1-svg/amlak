// بازیابی رمز با پیامک — مرحلهٔ ۳: تنظیم رمز تازه با کد تاییدشده.
// کد یک بار مصرف است؛ پس از تنظیم رمز، همهٔ نشست‌های قبلی کاربر با
// افزایش tokenVersion بی‌اعتبار می‌شوند (مثل ریست رمز توسط مدیر).
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, invalidateUserTokens, verifyPassword } from "@/lib/auth";
import { forgotPasswordResetSchema } from "@/lib/validation";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { toEnDigits } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import {
  FORGOT_RATE_LIMIT_MESSAGE,
  RESET_CODE_MAX_ATTEMPTS,
  checkForgotRateLimit,
  forgotRateLimitKeys,
  recordForgotAttempt,
} from "@/lib/passwordReset";

const NOT_VERIFIED_MESSAGE = "کد تایید نشده یا منقضی شده است — دوباره درخواست بدهید.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (body && typeof body.phone === "string") body.phone = toEnDigits(body.phone);
  const parsed = forgotPasswordResetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { phone, code, newPassword } = parsed.data;

  const keys = forgotRateLimitKeys(phone, clientIpFromHeaders(req.headers));
  if (!(await checkForgotRateLimit(keys))) {
    return NextResponse.json({ error: FORGOT_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const fail = async () => {
    if (await recordForgotAttempt(keys)) {
      return NextResponse.json({ error: FORGOT_RATE_LIMIT_MESSAGE }, { status: 429 });
    }
    return NextResponse.json({ error: NOT_VERIFIED_MESSAGE }, { status: 400 });
  };

  const row = await prisma.passwordResetCode.findUnique({ where: { phone } });
  if (!row || !row.verifiedAt || row.expiresAt.getTime() <= Date.now()) {
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

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    await prisma.passwordResetCode.delete({ where: { phone } }).catch(() => {});
    return fail();
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  await invalidateUserTokens(user.id);
  await prisma.passwordResetCode.delete({ where: { phone } }).catch(() => {});
  await createAuditLog({
    actorId: user.id,
    action: "PASSWORD_RESET_VIA_SMS",
    entityType: "User",
    entityId: user.id,
  });
  return NextResponse.json({ ok: true, message: "رمز عبور تغییر کرد — حالا وارد شوید." });
}
