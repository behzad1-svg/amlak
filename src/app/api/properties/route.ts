import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import {
  PropertyType, PropertyDealType, PropertyStatus, PropertyVisibility
} from '@prisma/client';
import { matchPropertyToCustomers } from '@/lib/matching';
import { safeJsonStringify } from '@/lib/utils';
import { getUserFromSession } from '@/lib/auth';

const createPropertySchema = z.object({
  title: z.string().min(5).max(150),
  type: z.nativeEnum(PropertyType),
  dealType: z.nativeEnum(PropertyDealType),

  salePriceToman: z.union([z.number(), z.string()]).transform(val => BigInt(val)).optional().nullable(),
  depositToman: z.union([z.number(), z.string()]).transform(val => BigInt(val)).optional().nullable(),
  monthlyRentToman: z.union([z.number(), z.string()]).transform(val => BigInt(val)).optional().nullable(),

  status: z.nativeEnum(PropertyStatus).optional(),
  sizeSqm: z.number().min(0).optional().nullable(),
  beds: z.number().int().min(0).optional().nullable(),
  builtYear: z.number().int().min(1300).max(1500).optional().nullable(),
  floor: z.number().int().optional().nullable(),
  totalFloors: z.number().int().optional().nullable(),
  hasParking: z.boolean().optional(),
  hasStorage: z.boolean().optional(),
  region: z.string().min(2).max(100),
  address: z.string().max(500).optional().nullable(),
  images: z.array(z.string().url()).max(20).optional(),

  ownerId: z.string().cuid().optional(),
  listedById: z.string().cuid().optional(),
  visibility: z.nativeEnum(PropertyVisibility).optional(),
}).refine(data => {
  if (data.dealType === 'SALE') {
    return data.salePriceToman !== undefined && data.depositToman === undefined && data.monthlyRentToman === undefined;
  } else if (data.dealType === 'RENT') {
    return data.depositToman !== undefined && data.monthlyRentToman !== undefined && data.salePriceToman === undefined;
  }
  return true;
}, {
  message: "Invalid pricing fields for the selected dealType.",
  path: ["dealType"]
});

export async function POST(request: Request) {
  try {
    const user = await getUserFromSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = createPropertySchema.parse(body);

    let listerId = validatedData.listedById || user.id;

    let ownerId = validatedData.ownerId;
    if (!ownerId) {
      let defaultOwner = await prisma.customer.findFirst({ where: { phone: '09123456789' } });
      if (!defaultOwner) {
        defaultOwner = await prisma.customer.create({
            data: {
                name: 'صاحب پیش‌فرض',
                phone: '09123456789',
                type: 'SELLER',
                assignedAgentId: listerId,
                nextFollowUpAt: new Date()
            }
        });
      }
      ownerId = defaultOwner.id;
    }


    const newProperty = await prisma.property.create({
      data: {
        ...validatedData,
        listedById: listerId,
        ownerId: ownerId
      },
    });

    // Run matching synchronously
    await matchPropertyToCustomers(newProperty);

    return new NextResponse(safeJsonStringify(newProperty), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'خطای اعتبارسنجی', details: error.issues }, { status: 400 });
    }
    console.error("Create property error:", error);
    return NextResponse.json({ error: 'خطای داخلی سرور' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const user = await getUserFromSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const whereClause: any = { deletedAt: null };
    // Only agents are restricted to their own properties
    if (user.role === 'AGENT') {
      whereClause.listedById = user.id;
    }

    const properties = await prisma.property.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });
    return new NextResponse(safeJsonStringify(properties), {
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
