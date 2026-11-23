// محاسبه کمیسیون — همان فرمول حسابداری:
// فروش: درصد کمیسیون (پیش‌فرض ۰٫۲۵٪) × قیمت فروش.
// رهن و اجاره: ۲۵٪ اجاره ماهانه + ۲۵٪ از سه‌صدم ودیعه.
// مالیات ارزش افزوده ۱۰٪ فقط روی کمیسیون حساب می‌شود.
import { DEFAULT_TAX_RATE_PCT } from "./constants";

export const DEFAULT_SALE_COMMISSION_PCT = 0.25;
export const RENT_COMMISSION_PCT = 25;

export function calcSaleCommission(priceToman: number, percent: number): number {
  if (!Number.isFinite(priceToman) || !Number.isFinite(percent) || priceToman <= 0 || percent < 0 || percent > 100) return 0;
  return Math.round((priceToman * percent) / 100);
}

export function calcRentCommission(depositToman: number, monthlyRentToman: number): number {
  if (!Number.isFinite(depositToman) || !Number.isFinite(monthlyRentToman) || depositToman < 0 || monthlyRentToman < 0) return 0;
  const base = monthlyRentToman + (depositToman * 3) / 100;
  return Math.round((base * RENT_COMMISSION_PCT) / 100);
}

// تقسیم دریافتی معامله فروش: کمیسیون همیشه ۰٫۲۵٪ قیمت فروش است،
// مالیات ۱۰٪ فقط روی کمیسیون است و بقیهٔ دریافتی شیرینی معامله می‌شود:
// دریافتی = کمیسیون + مالیات + شیرینی.
export function splitReceived(
  priceToman: number,
  receivedToman: number,
  percent: number = DEFAULT_SALE_COMMISSION_PCT,
  taxRatePct: number = DEFAULT_TAX_RATE_PCT
): { commission: number; vat: number; shirini: number } {
  const commission = calcSaleCommission(priceToman, percent);
  if (commission <= 0 || receivedToman < 0) return { commission: 0, vat: 0, shirini: 0 };
  const vat = calcVat(commission, taxRatePct);
  return { commission, vat, shirini: Math.max(0, receivedToman - commission - vat) };
}

// تقسیم دریافتی یک طرف معامله (فروشنده یا خریدار؛ اجاره: مالک یا مستاجر):
// کمیسیون همان طرف معلوم است، مالیات ۱۰٪ همیشه روی کمیسیون کامل حساب
// می‌شود، و بقیهٔ دریافتی شیرینی همان طرف است. اگر دریافتی کمتر از
// کمیسیون + مالیات باشد، شیرینی صفر و کمبودِ آن تخفیف همان طرف است —
// تخفیف فقط از کمیسیون کم می‌کند، هرگز از مالیات.
export function splitSideReceived(
  commissionToman: number,
  receivedToman: number,
  taxRatePct: number = DEFAULT_TAX_RATE_PCT
): { commission: number; vat: number; shirini: number; discount: number } {
  const zero = { commission: 0, vat: 0, shirini: 0, discount: 0 };
  if (!Number.isFinite(commissionToman) || !Number.isFinite(receivedToman) || commissionToman <= 0 || receivedToman <= 0) {
    return zero;
  }
  const vat = calcVat(commissionToman, taxRatePct);
  const towardCommission = receivedToman - vat;
  if (towardCommission >= commissionToman) {
    return { commission: commissionToman, vat, shirini: towardCommission - commissionToman, discount: 0 };
  }
  return { commission: commissionToman, vat, shirini: 0, discount: commissionToman - Math.max(0, towardCommission) };
}

/** تقسیم دریافتی یک طرف در فروش: کمیسیون همان طرف = درصد × قیمت فروش. */
export function splitSaleSide(
  priceToman: number,
  receivedToman: number,
  percent: number = DEFAULT_SALE_COMMISSION_PCT,
  taxRatePct: number = DEFAULT_TAX_RATE_PCT
): { commission: number; vat: number; shirini: number; discount: number } {
  return splitSideReceived(calcSaleCommission(priceToman, percent), receivedToman, taxRatePct);
}

/** تقسیم دریافتی یک طرف در اجاره: کمیسیون همان طرف = فرمول رهن و اجاره. */
export function splitRentSide(
  depositToman: number,
  monthlyRentToman: number,
  receivedToman: number,
  taxRatePct: number = DEFAULT_TAX_RATE_PCT
): { commission: number; vat: number; shirini: number; discount: number } {
  return splitSideReceived(calcRentCommission(depositToman, monthlyRentToman), receivedToman, taxRatePct);
}

export function calcVat(commissionToman: number, taxRatePct: number = DEFAULT_TAX_RATE_PCT): number {
  if (!Number.isFinite(commissionToman) || commissionToman <= 0) return 0;
  return Math.round((commissionToman * taxRatePct) / 100);
}
