import { z } from 'zod';
import {
  CustomerType,
  CustomerPipelineStage,
  CustomerTemperature,
  CustomerSource,
  PropertyType,
  PropertyDealType,
  PropertyStatus,
  PropertyVisibility,
} from '@prisma/client';

export const CustomerSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(15),
  type: z.nativeEnum(CustomerType),
  stage: z.nativeEnum(CustomerPipelineStage).optional(),
  temperature: z.nativeEnum(CustomerTemperature).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  notes: z.string().max(1000).optional(),

  preferredType: z.nativeEnum(PropertyType).optional(),
  preferredDealType: z.nativeEnum(PropertyDealType).optional(),
  preferredArea: z.string().max(100).optional(),
  preferredBeds: z.number().int().min(0).optional(),
  preferredSizeMin: z.number().min(0).optional(),
  preferredSizeMax: z.number().min(0).optional(),

  // Zod can transform strings to BigInt for APIs
  budgetMin: z.union([z.number(), z.string()]).transform((val) => BigInt(val)).optional(),
  budgetMax: z.union([z.number(), z.string()]).transform((val) => BigInt(val)).optional(),

  assignedAgentId: z.string().cuid(),
});

export const PropertySchema = z.object({
  title: z.string().min(5).max(150),
  type: z.nativeEnum(PropertyType),
  dealType: z.nativeEnum(PropertyDealType),

  salePriceToman: z.union([z.number(), z.string()]).transform((val) => BigInt(val)).optional(),
  depositToman: z.union([z.number(), z.string()]).transform((val) => BigInt(val)).optional(),
  monthlyRentToman: z.union([z.number(), z.string()]).transform((val) => BigInt(val)).optional(),

  status: z.nativeEnum(PropertyStatus).optional(),
  sizeSqm: z.number().min(0).optional(),
  beds: z.number().int().min(0).optional(),
  builtYear: z.number().int().min(1300).max(1500).optional(),
  floor: z.number().int().optional(),
  totalFloors: z.number().int().optional(),
  hasParking: z.boolean().optional(),
  hasStorage: z.boolean().optional(),
  region: z.string().min(2).max(100),
  address: z.string().max(500).optional(),
  images: z.array(z.string().url()).max(20).optional(),

  ownerId: z.string().cuid(),
  listedById: z.string().cuid(),
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
