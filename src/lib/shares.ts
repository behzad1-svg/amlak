import { toFaDigits } from "./utils";

/**
 * سهم‌بندی کمیسیون و شیرینی معامله‌ها.
 *
 * هر معامله یک «سهم دفتر» (officePct) و چند «سهم» دارد؛ سهم یا مشاور داخلی
 * (userId) است یا همکار بیرونی «تعاون» (userId خالی + نام متنی).
 * مبنای تقسیم = کمیسیون + شیرینی فروشنده + شیرینی خریدار؛ درصدها روی همین
 * جمع اعمال می‌شوند و هر سهم جداگانه تسویه می‌شود. مالیات اینجا نیست.
 *
 * معامله‌های قدیمی که سهم واقعی ندارند، از درصد دفتر ذخیره‌شده استفاده
 * می‌کنند: دفتر officePct٪ از مبنا می‌گیرد و بقیه (۱۰۰ − officePct) با یک
 * سهم مجازی به مشاور معامله می‌رسد (تسویه‌شده بودنش همان commissionPaid
 * معامله است). وقتی مدیر روی چنین معامله‌ای تقسیم را ویرایش کند، سهم‌های
 * واقعی ساخته می‌شوند. این قانون از ۲۰۲۶-۱۱-۲۰ است (تصمیم بهزاد: دفتر
 * خودش یک طرف حساب است و سهم و درآمدش باید مشخص باشد)؛ پیش از آن سهم
 * مجازی ۱۰۰٪ بود و سهم دفتر صفر حساب می‌شد.
 *
 * قانون طلایی: هیچ گزارش یا خلاصه‌ای نباید officePct ذخیره‌شده را مستقیم
 * بخواند — همه مسیرها باید از resolveSplit بگذرند، وگرنه عددشان با
 * گزارش‌های دیگر نمی‌خواند.
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
  /** تفکیک مبلغ سهم: چقدرش کمیسیون (خالص پس از تخفیف) و چقدرش شیرینی — جمعشان دقیقاً amount است */
  commissionAmount: bigint;
  shiriniAmount: bigint;
  virtual: boolean;
};

export type ResolvedSplit = {
  /** سهم دفتر ٪؛ برای مشاور null است (سهم دفتر را نمی‌بیند) */
  officePct: number | null;
  officeAmount: bigint | null;
  /** تفکیک سهم دفتر به کمیسیون و شیرینی — جمعشان دقیقاً officeAmount است */
  officeCommissionAmount: bigint | null;
  officeShiriniAmount: bigint | null;
  shares: ResolvedShare[];
};

/** تلرانس جمع درصدها موقع اعتبارسنجی (دقیقاً ۱۰۰٪، با ۰٫۰۱ تلرانس) */
export const SHARE_TOTAL_TOLERANCE = 0.01;

export function shareAmount(base: bigint | null | undefined, pct: number): bigint {
  if (base == null) return BigInt(0);
  // درصد (که می تواند اعشاری باشد) به صدم درصد تبدیل می شود تا ضرب با BigInt
  // دقیق بماند؛ مبنا در داده معتبر نامنفی است و گرد کردن نیم به بالا است
  const bps = BigInt(Math.round(pct * 100));
  return (base * bps + BigInt(5000)) / BigInt(10000);
}

/** تلرانس مجاز اختلاف مبلغ کمیسیون با درصد × قیمت (تومان) — فقط خطای گرد کردن؛
 *  محاسبه مرورگر (Math.round) و سرور (BigInt نیم‌به‌بالا) برای مبالغ واقعی
 *  حداکثر چند تومان اختلاف دارند، پس ۱۰۰ تومان با حاشیه امن کافی است. */
export const COMMISSION_AMOUNT_TOLERANCE_TOMAN = BigInt(100);

/**
 * مبلغ کمیسیون موردانتظار از قیمت معامله × درصد — همان قانون گرد کردن
 * shareAmount (نیم‌به‌بالا، با دقت صدم درصد)؛ مرورگر هم همین را با
 * Math.round حساب می‌کند (calcCommissionAmount در صفحه حسابداری).
 */
export function commissionAmountFor(price: bigint, percent: number): bigint {
  const bps = BigInt(Math.round(percent * 100));
  return (price * bps + BigInt(5000)) / BigInt(10000);
}

/**
 * اعتبارسنجی جفت مبلغ/درصد کمیسیون برای معامله فروش؛ null یعنی سازگار،
 * وگرنه پیام خطای فارسی با مبلغ موردانتظار. اجاره دستی است و چک نمی‌شود —
 * صدا زدن این تابع فقط برای فروش معنا دارد. هر سه ورودی خالی یعنی
 * «تعیین نشده» و چک نمی‌شود.
 */
export function validateCommissionAmount(
  price: bigint | null,
  percent: number | null | undefined,
  amount: bigint | null,
): string | null {
  if (price == null || percent == null || amount == null) return null;
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  const expected = commissionAmountFor(price, percent);
  const diff = amount >= expected ? amount - expected : expected - amount;
  if (diff <= COMMISSION_AMOUNT_TOLERANCE_TOMAN) return null;
  return `مبلغ کمیسیون با درصدش نمی‌خواند؛ با این قیمت و درصد، مبلغ باید ${toFaDigits(String(expected))} تومان باشد`;
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
  sellerCommissionToman?: bigint | null;
  buyerCommissionToman?: bigint | null;
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
  discountToman?: bigint | null;
  sellerDiscountToman?: bigint | null;
  buyerDiscountToman?: bigint | null;
  commissionPaid: boolean;
  officePct: unknown;
  agentId: string;
  agent?: { id: string; name: string } | null;
  shares: DealShareLike[];
};

/** کمیسیون کل معامله: جمع دو طرف (فروشنده + خریدار) وقتی دست‌کم یک طرف ثبت شده؛
 *  وگرنه کمیسیون تک‌طرفهٔ قدیمی (معامله‌های پیش از دوطرفه شدن). */
export function dealTotalCommission(deal: {
  commissionToman: bigint | null;
  sellerCommissionToman?: bigint | null;
  buyerCommissionToman?: bigint | null;
}): bigint {
  if (deal.sellerCommissionToman != null || deal.buyerCommissionToman != null) {
    return (deal.sellerCommissionToman ?? BigInt(0)) + (deal.buyerCommissionToman ?? BigInt(0));
  }
  return deal.commissionToman ?? BigInt(0);
}

/** تخفیف کل معامله: جمع تخفیف دو طرف، وگرنه تخفیف تک‌فیلدی قدیمی. */
export function dealTotalDiscount(deal: {
  discountToman?: bigint | null;
  sellerDiscountToman?: bigint | null;
  buyerDiscountToman?: bigint | null;
}): bigint {
  if (deal.sellerDiscountToman != null || deal.buyerDiscountToman != null) {
    return (deal.sellerDiscountToman ?? BigInt(0)) + (deal.buyerDiscountToman ?? BigInt(0));
  }
  return deal.discountToman ?? BigInt(0);
}

/** شیرینی کل معامله: شیرینی فروشنده + شیرینی خریدار (هر کدام خالی یعنی صفر). */
export function dealTotalShirini(deal: {
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
}): bigint {
  return (deal.sellerShiriniToman ?? BigInt(0)) + (deal.buyerShiriniToman ?? BigInt(0));
}

/** مبنای تقسیم (خالص): کمیسیون کل (دو طرف) + شیرینی فروشنده + شیرینی خریدار منهای تخفیف کل (هر کدام خالی یعنی صفر). */
export function dealSplittable(deal: {
  commissionToman: bigint | null;
  sellerCommissionToman?: bigint | null;
  buyerCommissionToman?: bigint | null;
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
  discountToman?: bigint | null;
  sellerDiscountToman?: bigint | null;
  buyerDiscountToman?: bigint | null;
}): bigint {
  return dealTotalCommission(deal) + dealTotalShirini(deal) - dealTotalDiscount(deal);
}

/** مبنای مالیات: فقط کمیسیون کل (ناخالص، بدون تخفیف) — شیرینی مالیات ندارد. */
export function dealTaxBase(deal: {
  commissionToman: bigint | null;
  sellerCommissionToman?: bigint | null;
  buyerCommissionToman?: bigint | null;
}): bigint {
  return dealTotalCommission(deal);
}

/** سهم‌بندی حل‌شدهٔ یک معامله — واقعی اگر سهم دارد، وگرنه دفتر officePct ذخیره‌شده + بقیه مجازی برای مشاور معامله. */
export function resolveSplit(deal: DealLike): ResolvedSplit {
  const base = dealSplittable(deal);
  // تفکیک هر سهم به کمیسیون و شیرینی: بخش کمیسیون از کمیسیون خالص (کمیسیون کل
  // منهای تخفیف کل) و بخش شیرینی از شیرینی کل حساب می‌شود؛ بخش شیرینی = مبلغ
  // سهم منهای بخش کمیسیون تا جمع تفکیک دقیقاً مبلغ سهم شود (خطای گرد کردن ±۱ تومان
  // جذب بخش شیرینی می‌شود). مبلغ سهم (amount) مثل قبل همان shareAmount روی مبنای
  // کل است — هیچ جمعی عوض نمی‌شود.
  const commissionNet = dealTotalCommission(deal) - dealTotalDiscount(deal);
  const splitParts = (pct: number): { commissionAmount: bigint; shiriniAmount: bigint } => {
    const amount = shareAmount(base, pct);
    const commissionAmount = shareAmount(commissionNet > BigInt(0) ? commissionNet : BigInt(0), pct);
    return { commissionAmount, shiriniAmount: amount - commissionAmount };
  };
  if (deal.shares.length > 0) {
    const officePct = Number(deal.officePct ?? 0);
    const officeParts = splitParts(officePct);
    return {
      officePct,
      officeAmount: shareAmount(base, officePct),
      officeCommissionAmount: officeParts.commissionAmount,
      officeShiriniAmount: officeParts.shiriniAmount,
      shares: deal.shares.map((s) => {
        const parts = splitParts(Number(s.pct));
        return {
          id: s.id,
          userId: s.userId,
          name: s.name,
          pct: Number(s.pct),
          settled: s.settled,
          settledAt: s.settledAt,
          isExternal: s.userId == null,
          amount: shareAmount(base, Number(s.pct)),
          commissionAmount: parts.commissionAmount,
          shiriniAmount: parts.shiriniAmount,
          virtual: false,
        };
      }),
    };
  }
  if (base <= BigInt(0))
    return { officePct: 0, officeAmount: BigInt(0), officeCommissionAmount: BigInt(0), officeShiriniAmount: BigInt(0), shares: [] };
  // معامله بدون سهم واقعی: دفتر officePct ذخیره‌شده را می‌گیرد و بقیه به‌صورت
  // سهم مجازی به مشاور معامله می‌رسد. اگر دفتر ۱۰۰٪ باشد سهمی برای مشاور نمی‌ماند.
  const officePct = Math.min(100, Math.max(0, Number(deal.officePct ?? 0)));
  const agentPct = 100 - officePct;
  const officeParts = splitParts(officePct);
  return {
    officePct,
    officeAmount: shareAmount(base, officePct),
    officeCommissionAmount: officeParts.commissionAmount,
    officeShiriniAmount: officeParts.shiriniAmount,
    shares:
      agentPct > 0
        ? [
            {
              id: null,
              userId: deal.agentId,
              name: deal.agent?.name ?? "مشاور معامله",
              pct: agentPct,
              settled: deal.commissionPaid,
              settledAt: null,
              isExternal: false,
              amount: shareAmount(base, agentPct),
              commissionAmount: splitParts(agentPct).commissionAmount,
              shiriniAmount: splitParts(agentPct).shiriniAmount,
              virtual: true,
            },
          ]
        : [],
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
    officeCommissionAmount: null,
    officeShiriniAmount: null,
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
