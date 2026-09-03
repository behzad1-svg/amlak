import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { 
  CustomerType, CustomerPipelineStage, CustomerTemperature, 
  CustomerSource, LostReasonCategory, PropertyType, PropertyDealType 
} from '@prisma/client';
import { matchCustomerToProperties } from '@/lib/matching';
import { safeJsonStringify } from '@/lib/utils';
import { getUserFromSession } from '@/lib/auth';

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
  budgetMin: z.union([z.number(), z.string()]).transform(val => BigInt(val)).optional().nullable(),
  budgetMax: z.union([z.number(), z.string()]).transform(val => BigInt(val)).optional().nullable(),

  nextFollowUpAt: z.string().datetime().optional().nullable(),
  
  lostReasonCategory: z.nativeEnum(LostReasonCategory).optional().nullable(),
  lostReasonDetail: z.string().max(500).optional().nullable(),

  assignedAgentId: z.string().optional(),
}).refine((data) => {
  if (data.stage === CustomerPipelineStage.LOST) {
    return data.lostReasonCategory != null;
  }
  return true;
}, {
  message: "دلیل از دست رفتن مشتری الزامی است",
  path: ["lostReasonCategory"],
}).refine((data) => {
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
    const user = await getUserFromSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createCustomerSchema.parse(body);

    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phone: validatedData.phone,
        deletedAt: null,
      },
    });

    if (existingCustomer) {
      return NextResponse.json({ error: 'این شماره تلفن قبلاً ثبت شده است' }, { status: 400 });
    }

    let agentId = validatedData.assignedAgentId || user.id;

    const newCustomer = await prisma.customer.create({
      data: {
        ...validatedData,
        nextFollowUpAt: validatedData.nextFollowUpAt ? new Date(validatedData.nextFollowUpAt) : null,
        assignedAgentId: agentId,
        stage: validatedData.stage || CustomerPipelineStage.NEW,
        temperature: validatedData.temperature || CustomerTemperature.WARM,
      },
    });

    // Run matching synchronously
    await matchCustomerToProperties(newCustomer);

    return new NextResponse(safeJsonStringify(newCustomer), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'خطای اعتبارسنجی', details: error.issues }, { status: 400 });
    }
    console.error("Create customer error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return new NextResponse(safeJsonStringify(customers), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error("Fetch error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}
