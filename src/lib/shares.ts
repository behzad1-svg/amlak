import { toFaDigits } from "./utils";

/**
 * سهم‌بندی کمیسیون و شیرینی معامله‌ها.
 *
 * هر معامله یک «سهم دفتر» و چند «سهم» دارد؛ سهم یا مشاور داخلی (userId)
 * است یا همکار بیرونی «تعاون» (userId خالی + نام متنی). هر سهم دو درصد
 * جدا دارد: سهم از کمیسیون و سهم از شیرینی. دو مبنای مستقل‌اند — کمیسیون
 * خالص (کمیسیون کل منهای تخفیف کل) و شیرینی کل؛ مالیات اینجا نیست.
 * درصد شیرینی خالی یعنی همان درصد کمیسیون (معامله‌های قدیمی دقیقاً همان
 * مبلغ قبلی را می‌بینند).
 *
 * معامله‌های قدیمی که سهم واقعی ندارند، از درصد دفتر ذخیره‌شده استفاده
 * می‌کنند: دفتر officePct٪ از هر دو مبنا می‌گیرد و بقیه (۱۰۰ − officePct) با یک
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
  /** سهم از کمیسیون (٪) */
  pct: number;
  /** سهم از شیرینی (٪)؛ خالی یعنی همان pct */
  shiriniPct?: number | null;
};

export type ResolvedShare = {
  /** شناسه ردیف سهم؛ null یعنی سهم مجازی (معامله قدیمی بدون سهم واقعی) */
  id: string | null;
  userId: string | null;
  name: string;
  /** سهم از کمیسیون (٪) */
  pct: number;
  /** سهم از شیرینی (٪) — همیشه عدد است؛ خالی ذخیره‌شده یعنی همان pct */
  shiriniPct: number;
  settled: boolean;
  settledAt: Date | string | null;
  isExternal: boolean;
  /** مبلغ سهم = بخش کمیسیون + بخش شیرینی */
  amount: bigint;
  /** تفکیک مبلغ سهم: چقدرش کمیسیون (خالص پس از تخفیف) و چقدرش شیرینی — جمعشان دقیقاً amount است */
  commissionAmount: bigint;
  shiriniAmount: bigint;
  virtual: boolean;
};

export type ResolvedSplit = {
  /** سهم دفتر از کمیسیون ٪؛ برای مشاور null است (سهم دفتر را نمی‌بیند) */
  officePct: number | null;
  /** سهم دفتر از شیرینی ٪؛ برای مشاور null است */
  officeShiriniPct: number | null;
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
  shiriniPct?: unknown;
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
  officeShiriniPct?: unknown;
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

/**
 * دو مبنای مستقل تقسیم: کمیسیون خالص و شیرینی. تخفیف اول از کمیسیون کم
 * می‌شود؛ اگر تخفیف بیشتر از کمیسیون باشد، اضافه‌اش از شیرینی کم می‌شود.
 * جمع دو مبنا دقیقاً مبنای تقسیم (dealSplittable) است — برای داده معتبر
 * (تخفیف حداکثر جمع کمیسیون + شیرینی) هر دو مبنا نامنفی‌اند.
 */
export function dealSplitPools(deal: {
  commissionToman: bigint | null;
  sellerCommissionToman?: bigint | null;
  buyerCommissionToman?: bigint | null;
  sellerShiriniToman?: bigint | null;
  buyerShiriniToman?: bigint | null;
  discountToman?: bigint | null;
  sellerDiscountToman?: bigint | null;
  buyerDiscountToman?: bigint | null;
}): { commission: bigint; shirini: bigint } {
  const totalCommission = dealTotalCommission(deal);
  const totalDiscount = dealTotalDiscount(deal);
  const totalShirini = dealTotalShirini(deal);
  const overCommission = totalDiscount > totalCommission ? totalDiscount - totalCommission : BigInt(0);
  const commission = totalCommission - totalDiscount > BigInt(0) ? totalCommission - totalDiscount : BigInt(0);
  const shirini = totalShirini - overCommission > BigInt(0) ? totalShirini - overCommission : BigInt(0);
  return { commission, shirini };
}

/**
 * مبلغ یک سهم از روی دو درصدش. وقتی درصد شیرینی برابر درصد کمیسیون است
 * (یا خالی است)، دقیقاً محاسبهٔ قبلی روی مبنای کل انجام می‌شود تا
 * معامله‌های قدیمی همان مبلغ قبلی را ببینند؛ وگرنه مبلغ جمع دو بخش
 * مستقل است. تفکیک برگشتی همیشه دقیقاً با مبلغ جمع می‌شود.
 */
export function splitShareAmount(
  deal: Parameters<typeof dealSplitPools>[0],
  pct: number,
  shiriniPct: number | null | undefined,
): { amount: bigint; commissionAmount: bigint; shiriniAmount: bigint } {
  const ps = shiriniPct ?? pct;
  const pools = dealSplitPools(deal);
  const commissionAmount = shareAmount(pools.commission, pct);
  if (ps === pct) {
    const amount = shareAmount(dealSplittable(deal), pct);
    return { amount, commissionAmount, shiriniAmount: amount - commissionAmount };
  }
  const shiriniAmount = shareAmount(pools.shirini, ps);
  return { amount: commissionAmount + shiriniAmount, commissionAmount, shiriniAmount };
}

/** سهم‌بندی حل‌شدهٔ یک معامله — واقعی اگر سهم دارد، وگرنه دفتر officePct ذخیره‌شده + بقیه مجازی برای مشاور معامله. */
export function resolveSplit(deal: DealLike): ResolvedSplit {
  const base = dealSplittable(deal);
  // هر سهم دو درصد جدا دارد (کمیسیون و شیرینی)؛ درصد شیرینی خالی یعنی همان
  // درصد کمیسیون — آن وقت splitShareAmount دقیقاً محاسبهٔ قبلی را می‌دهد.
  const officePct = Number(deal.officePct ?? 0);
  const officeShiriniPct = deal.officeShiriniPct != null ? Number(deal.officeShiriniPct) : officePct;
  const officeParts = splitShareAmount(deal, officePct, officeShiriniPct);
  if (deal.shares.length > 0) {
    return {
      officePct,
      officeShiriniPct,
      officeAmount: officeParts.amount,
      officeCommissionAmount: officeParts.commissionAmount,
      officeShiriniAmount: officeParts.shiriniAmount,
      shares: deal.shares.map((s) => {
        const pct = Number(s.pct);
        const shiriniPct = s.shiriniPct != null ? Number(s.shiriniPct) : pct;
        const parts = splitShareAmount(deal, pct, shiriniPct);
        return {
          id: s.id,
          userId: s.userId,
          name: s.name,
          pct,
          shiriniPct,
          settled: s.settled,
          settledAt: s.settledAt,
          isExternal: s.userId == null,
          amount: parts.amount,
          commissionAmount: parts.commissionAmount,
          shiriniAmount: parts.shiriniAmount,
          virtual: false,
        };
      }),
    };
  }
  if (base <= BigInt(0))
    return {
      officePct: 0,
      officeShiriniPct: 0,
      officeAmount: BigInt(0),
      officeCommissionAmount: BigInt(0),
      officeShiriniAmount: BigInt(0),
      shares: [],
    };
  // معامله بدون سهم واقعی: دفتر officePct ذخیره‌شده را می‌گیرد و بقیه به‌صورت
  // سهم مجازی به مشاور معامله می‌رسد. اگر دفتر ۱۰۰٪ باشد سهمی برای مشاور نمی‌ماند.
  const officePctClamped = Math.min(100, Math.max(0, officePct));
  const officeShiriniPctClamped = Math.min(100, Math.max(0, officeShiriniPct));
  const officePartsClamped = splitShareAmount(deal, officePctClamped, officeShiriniPctClamped);
  const agentPct = 100 - officePctClamped;
  const agentParts = splitShareAmount(deal, agentPct, agentPct);
  return {
    officePct: officePctClamped,
    officeShiriniPct: officeShiriniPctClamped,
    officeAmount: officePartsClamped.amount,
    officeCommissionAmount: officePartsClamped.commissionAmount,
    officeShiriniAmount: officePartsClamped.shiriniAmount,
    shares:
      agentPct > 0
        ? [
            {
              id: null,
              userId: deal.agentId,
              name: deal.agent?.name ?? "مشاور معامله",
              pct: agentPct,
              shiriniPct: agentPct,
              settled: deal.commissionPaid,
              settledAt: null,
              isExternal: false,
              amount: agentParts.amount,
              commissionAmount: agentParts.commissionAmount,
              shiriniAmount: agentParts.shiriniAmount,
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
    officeShiriniPct: null,
    officeAmount: null,
    officeCommissionAmount: null,
    officeShiriniAmount: null,
    shares: split.shares.filter((s) => s.userId === viewerId),
  };
}

/**
 * اعتبارسنجی ورودی سهم‌بندی؛ null یعنی معتبر، وگرنه پیام خطای فارسی.
 * دو جمع جدا چک می‌شوند: مجموع سهم‌های کمیسیون و مجموع سهم‌های شیرینی —
 * هر دو باید دقیقاً ۱۰۰٪ شوند. درصد شیرینی هر سهم خالی یعنی همان درصد کمیسیون.
 */
export function validateSplitInput(officePct: number, officeShiriniPct: number | null, shares: ShareInput[]): string | null {
  if (!Number.isFinite(officePct) || officePct < 0 || officePct > 100) {
    return "سهم دفتر باید بین ۰ تا ۱۰۰ باشد";
  }
  // درصد شیرینی دفتر خالی یعنی همان درصد کمیسیون دفتر
  const officeShirini = officeShiriniPct ?? officePct;
  if (!Number.isFinite(officeShirini) || officeShirini < 0 || officeShirini > 100) {
    return "سهم دفتر از شیرینی باید بین ۰ تا ۱۰۰ باشد";
  }
  if (shares.length === 0 && (officePct < 100 || officeShirini < 100)) {
    return `مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (کمیسیون الان ${toFaDigits(String(Math.round(officePct * 100) / 100))}٪، شیرینی ${toFaDigits(String(Math.round(officeShirini * 100) / 100))}٪ است)`;
  }
  const seen = new Set<string>();
  let totalCommission = officePct;
  let totalShirini = officeShirini;
  for (const s of shares) {
    if (!Number.isFinite(s.pct) || s.pct <= 0 || s.pct > 100) {
      return "درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد";
    }
    const spct = s.shiriniPct ?? s.pct;
    if (!Number.isFinite(spct) || spct < 0 || spct > 100) {
      return "درصد شیرینی هر سهم باید بین ۰ تا ۱۰۰ باشد";
    }
    if (s.userId) {
      if (seen.has(s.userId)) return "یک مشاور نمی‌تواند دو سهم در یک معامله داشته باشد";
      seen.add(s.userId);
    } else if (!s.name || !s.name.trim()) {
      return "هر سهم باید مشاور یا نام همکار بیرونی داشته باشد";
    }
    totalCommission += s.pct;
    totalShirini += spct;
  }
  const commissionOk = Math.abs(totalCommission - 100) < SHARE_TOTAL_TOLERANCE;
  const shiriniOk = Math.abs(totalShirini - 100) < SHARE_TOTAL_TOLERANCE;
  if (!commissionOk || !shiriniOk) {
    return `مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (کمیسیون الان ${toFaDigits(String(Math.round(totalCommission * 100) / 100))}٪، شیرینی ${toFaDigits(String(Math.round(totalShirini * 100) / 100))}٪ است)`;
  }
  return null;
}
