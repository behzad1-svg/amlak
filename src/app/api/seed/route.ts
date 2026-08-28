import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await prisma.customer.deleteMany({});
    await prisma.customer.createMany({
      data: [
        { name: "محمد رضایی", phone: "09121234567", type: "خریدار", stage: "INITIAL_CONTACT", temp: "داغ", area: "سعادت‌آباد", budget: "۳ میلیارد", source: "سایت", nextFollowUp: "امروز" },
        { name: "سعید رحیمی", phone: "09382201190", type: "خریدار", stage: "VIEWING", temp: "گرم", area: "شهرک صنعتی", budget: "۲ میلیارد", source: "اینستاگرام", nextFollowUp: "فردا" },
        { name: "مریم حسینی", phone: "09354418820", type: "مستاجر", stage: "QUALIFIED", temp: "سرد", area: "بندرگاه", budget: "ماهی ۸ میلیون", source: "تماس", nextFollowUp: "امروز" }
      ],
    });
    return NextResponse.json({ message: "Database seeded successfully!" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}