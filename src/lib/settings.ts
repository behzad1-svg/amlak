import { prisma } from "./prisma";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES, DEFAULT_CUSTOMER_TAGS, DEFAULT_TAX_RATE_PCT } from "./constants";

export async function getRegions(): Promise<string[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "regions" } });
    if (row) return JSON.parse(row.value) as string[];
  } catch {}
  return [...DEFAULT_BUSHEHR_REGIONS];
}

export async function getCustomerTags(): Promise<string[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "customerTags" } });
    if (row) return JSON.parse(row.value) as string[];
  } catch {}
  return [...DEFAULT_CUSTOMER_TAGS];
}

/** نرخ مالیات ارزش افزوده (٪) — عدد ۰ تا ۱۰۰؛ نامعتبر یا غایب یعنی پیش‌فرض. */
export async function getTaxRatePct(): Promise<number> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "taxRate" } });
    if (row) {
      const n = Number(JSON.parse(row.value));
      if (Number.isFinite(n) && n >= 0 && n <= 100) return n;
    }
  } catch {}
  return DEFAULT_TAX_RATE_PCT;
}

export async function getPropertyTypes(): Promise<{ value: string; label: string }[]> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "propertyTypes" } });
    if (row) return JSON.parse(row.value) as { value: string; label: string }[];
  } catch {}
  return [...DEFAULT_PROPERTY_TYPES];
}
