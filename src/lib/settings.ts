import { prisma } from "./prisma";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES } from "./constants";

export async function getRegions(): Promise<string[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "regions" } });
    if (row) return JSON.parse(row.value) as string[];
  } catch {}
  return [...DEFAULT_BUSHEHR_REGIONS];
}

export async function getPropertyTypes(): Promise<{ value: string; label: string }[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
    if (row) return JSON.parse(row.value) as { value: string; label: string }[];
  } catch {}
  return [...DEFAULT_PROPERTY_TYPES];
}
