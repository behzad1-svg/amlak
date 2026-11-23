import { prisma } from "./prisma";
import { DEFAULT_BUSHEHR_REGIONS, DEFAULT_PROPERTY_TYPES, DEFAULT_CUSTOMER_TAGS, DEFAULT_TAX_RATE_PCT, DEFAULT_ATTENDANCE_SETTINGS } from "./constants";
import { parseHHMM, type AttendanceSettings } from "./attendance";

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
/** تنظیمات حضور و غیاب — از AppSetting با کلید attendance خوانده می‌شود؛
 *  هر مقدار نامعتبر یا غایب به پیش‌فرض برمی‌گردد (مرکز دفتر تاییدشدهٔ بهزاد). */
export async function getAttendanceSettings(): Promise<AttendanceSettings> {
  const d: AttendanceSettings = { ...DEFAULT_ATTENDANCE_SETTINGS };
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: "attendance" } });
    if (!row) return d;
    const v = JSON.parse(row.value) as Partial<AttendanceSettings>;
    if (typeof v.officeLat === "number" && Number.isFinite(v.officeLat) && Math.abs(v.officeLat) <= 90) d.officeLat = v.officeLat;
    if (typeof v.officeLng === "number" && Number.isFinite(v.officeLng) && Math.abs(v.officeLng) <= 180) d.officeLng = v.officeLng;
    if (typeof v.radiusM === "number" && Number.isFinite(v.radiusM) && v.radiusM >= 10 && v.radiusM <= 2000) d.radiusM = Math.round(v.radiusM);
    if (typeof v.morningStart === "string" && parseHHMM(v.morningStart) !== null) d.morningStart = v.morningStart;
    if (typeof v.morningEnd === "string" && parseHHMM(v.morningEnd) !== null) d.morningEnd = v.morningEnd;
    if (typeof v.eveningStart === "string" && parseHHMM(v.eveningStart) !== null) d.eveningStart = v.eveningStart;
    if (typeof v.eveningEnd === "string" && parseHHMM(v.eveningEnd) !== null) d.eveningEnd = v.eveningEnd;
    if (typeof v.fridayOff === "boolean") d.fridayOff = v.fridayOff;
  } catch {}
  return d;
}
