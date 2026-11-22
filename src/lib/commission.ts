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

export function calcVat(commissionToman: number, taxRatePct: number = DEFAULT_TAX_RATE_PCT): number {
  if (!Number.isFinite(commissionToman) || commissionToman <= 0) return 0;
  return Math.round((commissionToman * taxRatePct) / 100);
}
