import crypto from 'crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // ۱. اطمینان از وجود یک کاربر پیش‌فرض (برای جلوگیری از خطای Foreign Key)
    let defaultAgent = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    if (!defaultAgent) {
      defaultAgent = await prisma.user.create({
        data: { 
          name: 'مدیر سیستم', 
          phone: '09123456789', 
          passwordHash: process.env.DEFAULT_PASSWORD_HASH || crypto.randomBytes(32).toString('hex'),
          role: 'OWNER' 
        }
      });
    }

    // ۲. پاک کردن داده‌های قدیمی
    await prisma.customer.deleteMany({});

    // ۳. درج داده‌های جدید با فرمت صحیح Enumها و تاریخ
    await prisma.customer.createMany({
      data: [
        {
          name: "محمد رضایی",
          phone: "09121234567",
          type: "BUYER", // Enum صحیح
          stage: "INITIAL_CONTACT",
          temperature: "HOT", // Enum صحیح
          preferredArea: "سعادت‌آباد",
          budgetMin: 3000000000,
          source: "WEBSITE", // Enum صحیح
          nextFollowUpAt: new Date(), // تاریخ امروز
          assignedAgentId: defaultAgent.id,
        },
        {
          name: "سعید رحیمی",
          phone: "09382201190",
          type: "BUYER",
          stage: "VIEWING",
          temperature: "WARM",
          preferredArea: "شهرک صنعتی",
          budgetMin: 2000000000,
          source: "INSTAGRAM",
          nextFollowUpAt: new Date(Date.now() + 86400000), // تاریخ فردا
          assignedAgentId: defaultAgent.id,
        },
        {
          name: "مریم حسینی",
          phone: "09354418820",
          type: "TENANT", // Enum صحیح
          stage: "QUALIFIED",
          temperature: "COLD",
          preferredArea: "بندرگاه",
          budgetMax: 8000000,
          source: "DIRECT_CALL", // Enum صحیح
          nextFollowUpAt: new Date(),
          assignedAgentId: defaultAgent.id,
        }
      ],
    });

    return NextResponse.json({ message: "Database seeded successfully!" });
  } catch (error) {
    console.error("Seed error:", error);
    return NextResponse.json({ error: "Failed to seed database" }, { status: 500 });
  }
}