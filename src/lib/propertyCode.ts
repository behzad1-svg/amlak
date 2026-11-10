import { prisma } from "./prisma";

const SEQ_KEY = "propertyCodeSeq";

function formatCode(n: number): string {
  return `F-${String(n).padStart(4, "0")}`;
}

/**
 * کد بعدی فایل:
 * 1) ensure ردیف شمارنده
 * 2) increment اتمیک در Postgres (ردیف قفل می‌شود — race نمی‌ماند)
 * 3) اگر Property.code یکتا رد شد (P2002)، شماره بعدی
 */
export async function nextPropertyCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await prisma.appSetting.upsert({
        where: { key: SEQ_KEY },
        update: {},
        create: { key: SEQ_KEY, value: "0" },
      });

      await prisma.$executeRaw`
        UPDATE "AppSetting"
        SET value = (COALESCE(value, '0')::bigint + 1)::text,
            "updatedAt" = NOW()
        WHERE key = ${SEQ_KEY}
      `;

      const row = await prisma.appSetting.findUnique({ where: { key: SEQ_KEY } });
      const n = Number(row?.value ?? "1");
      return formatCode(Number.isFinite(n) && n > 0 ? n : 1);
    } catch (e) {
      const errCode = (e as { code?: string }).code;
      // P2002: code تکراری روی Property — شماره بعدی
      // P2028: transaction timeout
      if (errCode === "P2002" || errCode === "P2028") continue;
      throw e;
    }
  }
  return formatCode(Number(String(Date.now()).slice(-6)));
}

export function normalizePropertyCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}
