import { prisma } from "./prisma";
import { toEnDigits } from "./utils";

const SEQ_KEY = "propertyCodeSeq";

function formatCode(n: number): string {
  return `F-${String(n).padStart(4, "0")}`;
}

/**
 * کد بعدی فایل:
 * 1) ensure ردیف شمارنده
 * 2) increment اتمیک در Postgres با UPDATE ... RETURNING (ردیف قفل می‌شود و
 *    مقدار تازه در همان دستور برمی‌گردد — race نمی‌ماند)
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

      // تخصیص اتمیک: UPDATE ... RETURNING مقدار افزایش‌یافته را در همان دستور
      // برمی‌گرداند — خواندن جداگانه با findUnique می‌توانست همان مقدار را
      // به دو درخواست هم‌زمان بدهد و روی Property.code یکتا برخورد کند
      const rows = await prisma.$queryRaw<{ value: string }[]>`
        UPDATE "AppSetting"
        SET value = (COALESCE(NULLIF(value, ''), '0')::bigint + 1)::text,
            "updatedAt" = NOW()
        WHERE key = ${SEQ_KEY}
        RETURNING value
      `;
      const n = Number(rows[0]?.value ?? "1");
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
  return toEnDigits(raw).trim().toUpperCase().replace(/\s+/g, "");
}
