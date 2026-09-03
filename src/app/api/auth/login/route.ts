import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_for_development';

export async function POST(request: Request) {
  try {
    const { phone, password } = await request.json();

    if (!phone || !password) {
      return NextResponse.json({ error: 'شماره تلفن و رمز عبور الزامی است' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      return NextResponse.json({ error: 'اطلاعات ورود اشتباه است' }, { status: 401 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json({ error: 'اطلاعات ورود اشتباه است' }, { status: 401 });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const cookieStore = await cookies();
    // Allow non-secure cookies in production if accessing via HTTP (e.g., bare IP)
    const isSecure = request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');

    cookieStore.set('session_token', token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 1 week
    });

    return NextResponse.json({ success: true, user: { id: user.id, name: user.name, role: user.role } }, { status: 200 });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}
