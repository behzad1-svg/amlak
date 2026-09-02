import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { 
  CustomerType, CustomerPipelineStage, CustomerTemperature, 
  CustomerSource, LostReasonCategory, PropertyType, PropertyDealType 
} from '@prisma/client';

// Schema اعتبارسنجی دقیق مطابق MVP
const createCustomerSchema = z.object({
  name: z.string().min(1, 'نام الزامی است').max(100),
  phone: z.string().min(10, 'شماره تلفن نامعتبر است').max(20),
  type: z.nativeEnum(CustomerType),
  stage: z.nativeEnum(CustomerPipelineStage).optional(),
  temperature: z.nativeEnum(CustomerTemperature).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  
  // ترجیحات
  preferredType: z.nativeEnum(PropertyType).optional().nullable(),
  preferredDealType: z.nativeEnum(PropertyDealType).optional().nullable(),
  preferredArea: z.string().max(100).optional().nullable(),
  preferredBeds: z.number().int().optional().nullable(),
  preferredSizeMin: z.number().optional().nullable(),
  preferredSizeMax: z.number().optional().nullable(),
  budgetMin: z.number().int().optional().nullable(),
  budgetMax: z.number().int().optional().nullable(),

  nextFollowUpAt: z.string().datetime().optional().nullable(),
  
  lostReasonCategory: z.nativeEnum(LostReasonCategory).optional().nullable(),
  lostReasonDetail: z.string().max(500).optional().nullable(),

  assignedAgentId: z.string().optional(),
}).refine((data) => {
  // قانون MVP: اگر LOST شد، دلیل الزامی است
  if (data.stage === CustomerPipelineStage.LOST) {
    return data.lostReasonCategory != null;
  }
  return true;
}, {
  message: "دلیل از دست رفتن مشتری الزامی است",
  path: ["lostReasonCategory"],
}).refine((data) => {
  // قانون MVP: اگر LOST نبود، پیگیری بعدی الزامی است
  if (data.stage !== CustomerPipelineStage.LOST) {
    return data.nextFollowUpAt != null;
  }
  return true;
}, {
  message: "تاریخ پیگیری بعدی الزامی است",
  path: ["nextFollowUpAt"],
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = createCustomerSchema.parse(body);

    // بررسی یکتا بودن شماره تلفن (فقط برای مشتریان حذف نشده)
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phone: validatedData.phone,
        deletedAt: null,
      },
    });

    if (existingCustomer) {
      return NextResponse.json({ error: 'این شماره تلفن قبلاً ثبت شده است' }, { status: 400 });
    }

    // مدیریت Agent برای v1 (چون هنوز لاگین نداریم)
    let agentId = validatedData.assignedAgentId;
    if (!agentId) {
      let defaultAgent = await prisma.user.findUnique({ where: { phone: '09123456789' } });
      if (!defaultAgent) {
        defaultAgent = await prisma.user.create({
          data: {
            name: 'مدیر سیستم',
            phone: '09123456789',
            passwordHash: 'temp_hash',
            role: 'OWNER',
          }
        });
      }
      agentId = defaultAgent.id;
    }

    const newCustomer = await prisma.customer.create({
      data: {
        ...validatedData,
        nextFollowUpAt: validatedData.nextFollowUpAt ? new Date(validatedData.nextFollowUpAt) : null,
        assignedAgentId: agentId,
        stage: validatedData.stage || CustomerPipelineStage.NEW,
        temperature: validatedData.temperature || CustomerTemperature.WARM,
      },
    });

    return NextResponse.json(newCustomer, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'خطای اعتبارسنجی', details: error.issues }, { status: 400 });
    }
    console.error("Create customer error:", error);
    // Global Error Handler: عدم نشت جزئیات فنی به کلاینت
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}