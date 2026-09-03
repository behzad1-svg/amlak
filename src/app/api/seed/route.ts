import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';

export async function POST(request: Request) {
  try {
    const passwordHash = await bcrypt.hash('admin', 10);
    const user = await prisma.user.upsert({
      where: { phone: '09123456789' },
      update: {
        passwordHash
      },
      create: {
        name: 'مدیر سیستم',
        phone: '09123456789',
        passwordHash,
        role: 'OWNER',
      }
    });

    return NextResponse.json({ success: true, message: 'Admin user created successfully' }, { status: 201 });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
