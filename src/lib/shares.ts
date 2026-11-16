import { toFaDigits } from "./utils";

/**
 * سهم‌بندی کمیسیون و شیرینی معامله‌ها.
 *
 * هر معامله یک «سهم دفتر» (officePct) و چند «سهم» دارد؛ سهم یا مشاور داخلی
 * (userId) است یا همکار بیرونی «تعاون» (userId خالی + نام متنی).
 * مبنای تقسیم = کمیسیون + شیرینی فروشنده + شیرینی خریدار؛ درصدها روی همین
 * جمع اعمال می‌شوند و هر سهم جداگانه تسویه می‌شود. مالیات اینجا نیست.
 *
 * معامله‌های قدیمی که سهم واقعی ندارند، عددشان عوض نمی‌شود: همه‌جا با یک
 * سهم مجازی ۱۰۰٪ برای مشاور معامله دیده می‌شوند (سهم دفتر صفر، تسویه‌شده
 * بودنش همان commissionPaid معامله است). وقتی مدیر روی چنین معامله‌ای
 * تقسیم را ویرایش کند، سهم‌های واقعی ساخته می‌شوند.
 */

export type ShareInput = {
  userId?: string | null;
  name?: string | null;
  pct: number;
};

export type ResolvedShare = {
  /** شناسه ردیف سهم؛ null یعنی سهم مجازی (معامله قدیمی بدون سهم واقعی) */
  id: string | null;
  userId: string | null;
  name: string;
  pct: number;
  settled: boolean;
  settledAt: Date | string | null;
  isExternal: boolean;
  /** مبلغ سهم = گرد شدهٔ مبنای تقسیم × pct / ۱۰۰ */
  amount: bigint;
  virtual: boolean;
};

export type ResolvedSplit = {
  /** سهم دفتر ٪؛ برای مشاور null است (سهم دفتر را نمی‌بیند) */
  officePct: number | null;
  officeAmount: bigint | null;
  shares: ResolvedShare[];
};

/** تلرانس جمع درصدها موقع اعتبارسنجی (دقیقاً ۱۰۰٪، با ۰٫۰۱ تلرانس) */
export const SHARE_TOTAL_TOLERANCE = 0.01;

export function shareAmount(base: bigint | null | undefined, pct: number): bigint {
  if (base == null) return BigInt(0);
  return BigInt(Math.round((Number(base) * pct) / 100));
}

/**
 * تقسیم مساویِ (۱۰۰ − سهم دفتر) بین n سهم، با دقت صدم درصد.
 * جمع خروجی دقیقاً ۱۰۰ − officePct است (باقی‌مانده صدم‌ها به سهم‌های اول می‌رسد).
 * مثال مدیر: دفتر ۶۰٪ و دو مشاور → هر کدام ۲۰٪.
 */
export function equalSplitPcts(officePct: number, count: number): number[] {
  if (count <= 0) return [];
  const totalHundredths = Math.round((100 - officePct) * 100);
  const per = Math.floor(totalHundredths / count);
  const remainder = totalHundredths - per * count;
  return Array.from({ length: count }, (_, i) => (per + (i < remainder ? 1 : 0)) / 100);
}

type DealShareLike = {
  id: string;
  userId: string | null;
  name: string;
  pct: unknown;
  settled: boolean;
  settledAt: Date | string | null;
};

type DealLike = {
  commissionToman: bigint | null;
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
  commissionPaid: boolean;
  officePct: unknown;
  agentId: string;
  agent?: { id: string; name: string } | null;
  shares: DealShareLike[];
};

/** مبنای تقسیم: کمیسیون + شیرینی فروشنده + شیرینی خریدار (هر کدام خالی یعنی صفر). */
export function dealSplittable(deal: {
  commissionToman: bigint | null;
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
}): bigint {
  return (
    (deal.commissionToman ?? BigInt(0)) +
    (deal.sellerShiriniToman ?? BigInt(0)) +
    (deal.buyerShiriniToman ?? BigInt(0))
  );
}

/** سهم‌بندی حل‌شدهٔ یک معامله — واقعی اگر سهم دارد، وگرنه مجازی ۱۰۰٪ برای مشاور معامله. */
export function resolveSplit(deal: DealLike): ResolvedSplit {
  const base = dealSplittable(deal);
  if (deal.shares.length > 0) {
    const officePct = Number(deal.officePct ?? 0);
    return {
      officePct,
      officeAmount: shareAmount(base, officePct),
      shares: deal.shares.map((s) => ({
        id: s.id,
        userId: s.userId,
        name: s.name,
        pct: Number(s.pct),
        settled: s.settled,
        settledAt: s.settledAt,
        isExternal: s.userId == null,
        amount: shareAmount(base, Number(s.pct)),
        virtual: false,
      })),
    };
  }
  if (base <= BigInt(0)) return { officePct: 0, officeAmount: BigInt(0), shares: [] };
  return {
    officePct: 0,
    officeAmount: BigInt(0),
    shares: [
      {
        id: null,
        userId: deal.agentId,
        name: deal.agent?.name ?? "مشاور معامله",
        pct: 100,
        settled: deal.commissionPaid,
        settledAt: null,
        isExternal: false,
        amount: base,
        virtual: true,
      },
    ],
  };
}

/**
 * نمای سهم‌بندی برای بیننده: مدیر همه‌چیز را می‌بیند؛ مشاور فقط سهم خودش را،
 * و سهم دفتر و سهم مشاورهای دیگر برایش پنهان است.
 */
export function splitForViewer(split: ResolvedSplit, viewerId: string | null, isOwner: boolean): ResolvedSplit {
  if (isOwner) return split;
  return {
    officePct: null,
    officeAmount: null,
    shares: split.shares.filter((s) => s.userId === viewerId),
  };
}

/** اعتبارسنجی ورودی سهم‌بندی؛ null یعنی معتبر، وگرنه پیام خطای فارسی. */
export function validateSplitInput(officePct: number, shares: ShareInput[]): string | null {
  if (!Number.isFinite(officePct) || officePct < 0 || officePct > 100) {
    return "سهم دفتر باید بین ۰ تا ۱۰۰ باشد";
  }
  if (shares.length === 0 && officePct < 100) {
    return "مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود";
  }
  const seen = new Set<string>();
  let total = officePct;
  for (const s of shares) {
    if (!Number.isFinite(s.pct) || s.pct <= 0 || s.pct > 100) {
      return "درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد";
    }
    if (s.userId) {
      if (seen.has(s.userId)) return "یک مشاور نمی‌تواند دو سهم در یک معامله داشته باشد";
      seen.add(s.userId);
    } else if (!s.name || !s.name.trim()) {
      return "هر سهم باید مشاور یا نام همکار بیرونی داشته باشد";
    }
    total += s.pct;
  }
  if (Math.abs(total - 100) >= SHARE_TOTAL_TOLERANCE) {
    return `مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (الان ${toFaDigits(String(Math.round(total * 100) / 100))}٪ است)`;
  }
  return null;
}
