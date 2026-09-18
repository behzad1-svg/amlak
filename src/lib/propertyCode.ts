import { prisma } from "./prisma";

const SEQ_KEY = "propertyCodeSeq";

/** کد بعدی فایل: F-0001, F-0002, ... */
export async function nextPropertyCode(): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key: SEQ_KEY } });
  let n = row ? parseInt(row.value, 10) : 0;
  if (!Number.isFinite(n) || n < 0) n = 0;

  // اگر فایل‌هایی از قبل کد دارند، از بیشینه عددی عبور نکن
  const codes = await prisma.property.findMany({
    where: { code: { startsWith: "F-" } },
    select: { code: true },
  });
  for (const c of codes) {
    if (!c.code) continue;
    const num = parseInt(c.code.slice(2), 10);
    if (Number.isFinite(num) && num > n) n = num;
  }

  n += 1;
  const code = `F-${String(n).padStart(4, "0")}`;

  await prisma.appSetting.upsert({
    where: { key: SEQ_KEY },
    update: { value: String(n) },
    create: { key: SEQ_KEY, value: String(n) },
  });

  return code;
}

export function normalizePropertyCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
