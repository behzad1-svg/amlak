import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword, signToken } from "@/lib/auth";
import { COOKIE_NAME, authCookieOptions } from "@/lib/jwt";
import { loginSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rateLimit";
import { serializeBigInt } from "@/lib/utils";

export async function POST(req: NextRequest) {
  // توجه: در دیپلوی تک‌نمونه، rateLimit حافظه‌ای کافی است؛ برای چند نمونه باید به Redis/DB مشترک سوییچ شود.
  // هدر x-forwarded-for قابل جعل است — فقط در پشت reverse-proxy معتبر است؛ در prod حتما XFF را فقط از proxy بپذیرید.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  const rl = rateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "تعداد تلاش بیش از حد مجاز، لطفا بعدا تلاش کنید" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { phone, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "شماره یا رمز عبور اشتباه است" }, { status: 401 });
  }

  const token = await signToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });

  const res = NextResponse.json(serializeBigInt({ user: { id: user.id, name: user.name, phone: user.phone, role: user.role } }));
  res.cookies.set(COOKIE_NAME, token, authCookieOptions());
  return res;
}
