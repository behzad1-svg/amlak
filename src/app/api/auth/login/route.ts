import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  try {
    const { phone, password } = await request.json();

    if (!phone || !password) {
      return NextResponse.json({ error: 'شماره تلفن و رمز عبور الزامی است' }, { status: 400 });
    }

    // Mock Authentication for MVP
    // We expect the default admin to be 09123456789 / admin
    if (phone === '09123456789' && password === 'admin') {

      // Ensure the mock admin user exists in the DB so operations work
      let user = await prisma.user.findUnique({ where: { phone } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            name: 'مدیر سیستم',
            phone: '09123456789',
            passwordHash: 'mocked_admin_hash',
            role: 'OWNER',
          }
        });
      }

      const cookieStore = await cookies();
      cookieStore.set('session_token', user.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7 // 1 week
      });

      return NextResponse.json({ success: true, user: { id: user.id, name: user.name, role: user.role } }, { status: 200 });
    }

    return NextResponse.json({ error: 'اطلاعات ورود اشتباه است' }, { status: 401 });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}
