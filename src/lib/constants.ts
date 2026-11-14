// مناطق بوشهر — قابل ویرایش از صفحه تنظیمات (DB: AppSetting)
export const DEFAULT_BUSHEHR_REGIONS = [
  "بهمنی",
  "سنگی",
  "عاشوری",
  "دواس",
  "جفره",
  "هلالی",
  "بیسیم",
  "مخ بلند",
  "صلح‌آباد",
  "نیایش",
  "باغ زهرا",
  "تنگک",
  "شغاب",
  "امامزاده",
  "چهارباندی",
  "باهنر",
  "ریشهر",
  "امام خمینی",
  "ساحلی",
  "دیگری",
] as const;

// برای سازگاری با کدهای موجود
export const BUSHEHR_REGIONS = DEFAULT_BUSHEHR_REGIONS;

// نوع ملک — قابل توسعه از تنظیمات
export const DEFAULT_PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: "APARTMENT", label: "آپارتمان" },
  { value: "VILLA", label: "ویلایی" },
  { value: "KOLANGI", label: "کلنگی" },
  { value: "LAND", label: "زمین" },
  { value: "SHOP", label: "مغازه" },
  { value: "OFFICE", label: "اداری" },
  { value: "COMMERCIAL", label: "تجاری" },
];

export const PROPERTY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  DEFAULT_PROPERTY_TYPES.map((x) => [x.value, x.label])
);

// نوع معامله فایل — فقط فروش یا رهن/اجاره (خرید در فایل معنا ندارد)
export const DEAL_TYPE_LABELS: Record<string, string> = {
  SALE: "فروش",
  RENT: "رهن و اجاره",
};

// مرحله مشتری — pipeline فروش فقط ۴ ستون اصلی
export const CUSTOMER_STAGE_LABELS: Record<string, string> = {
  NEW: "تماس اولیه",
  INITIAL_CONTACT: "تماس اولیه",
  QUALIFIED: "مذاکره",
  VIEWING: "بازدید",
  CONTRACT: "قرارداد",
  WON: "موفق",
  FAILED: "ناموفق",
  LOST: "بایگانی",
};

export const CUSTOMER_STAGE_ORDER = [
  "INITIAL_CONTACT",
  "VIEWING",
  "QUALIFIED",
  "CONTRACT",
] as const;

/** کانبان فروش — فقط ۴ ستون */
export const CUSTOMER_KANBAN_COLUMNS = [
  "INITIAL_CONTACT",
  "VIEWING",
  "QUALIFIED",
  "CONTRACT",
] as const;

export const CUSTOMER_STAGE_COLORS: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700 border-slate-200",
  INITIAL_CONTACT: "bg-blue-50 text-blue-700 border-blue-200",
  QUALIFIED: "bg-amber-50 text-amber-700 border-amber-200",
  VIEWING: "bg-purple-50 text-purple-700 border-purple-200",
  CONTRACT: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WON: "bg-emerald-100 text-emerald-800 border-emerald-300",
  FAILED: "bg-red-100 text-red-800 border-red-300",
  LOST: "bg-zinc-100 text-zinc-600 border-zinc-300",
};

export const TEMPERATURE_LABELS: Record<string, string> = {
  HOT: "داغ",
  WARM: "گرم",
  COLD: "سرد",
};

export const TEMPERATURE_COLORS: Record<string, string> = {
  HOT: "bg-red-500",
  WARM: "bg-amber-500",
  COLD: "bg-slate-400",
};

export const PROPERTY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "فعال",
  RESERVED: "رزرو",
  SOLD: "فروخته‌شده",
  RENTED: "اجاره‌رفته",
  ARCHIVED: "بایگانی‌شده",
};

export const LOST_REASON_LABELS: Record<string, string> = {
  CUSTOMER_WITHDREW: "مشتری منصرف شد",
  PRICE_REJECTED: "قیمت را نپذیرفت",
  NO_RESPONSE: "پاسخ نمی‌دهد",
  NO_SUITABLE_PROPERTY: "فایل مناسب نداشتیم",
  OTHER: "سایر",
};

export const CUSTOMER_SOURCE_LABELS: Record<string, string> = {
  INSTAGRAM: "اینستاگرام",
  DIVAR: "دیوار",
  DIRECT_CALL: "تماس مستقیم",
  REFERRAL: "معرفی",
  SIGN_BOARD: "تابلو",
  WEBSITE: "وب‌سایت",
  IN_PERSON: "حضوری",
  ADVERTISEMENT: "آگهی",
  OTHER: "سایر",
};

// گزینه‌های «شیوه آشنایی» در فرم ثبت مشتری — فقط همین ۶ مقدار
// (مقادیر قدیمی SIGN_BOARD و WEBSITE در دیتابیس می‌مانند و در پروفایل نمایش داده می‌شوند)
export const CUSTOMER_SOURCE_OPTIONS = [
  "DIVAR",
  "INSTAGRAM",
  "REFERRAL",
  "DIRECT_CALL",
  "IN_PERSON",
  "ADVERTISEMENT",
] as const;

// برچسب‌های پیش‌فرض مشتری — قابل ویرایش از صفحه تنظیمات (DB: AppSetting با کلید customerTags)
export const DEFAULT_CUSTOMER_TAGS = [
  "نقدی",
  "وام‌دار",
  "فوری",
  "سازنده",
  "خارج از شهر",
] as const;

export const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  BUYER: "خریدار",
  SELLER: "فروشنده",
  TENANT: "مستاجر",
  OWNER: "مالک",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  CALL: "تماس",
  MESSAGE: "پیام",
  MEETING: "جلسه",
  NOTE: "یادداشت",
  APPRAISAL: "کارشناسی",
  ADVERTISED: "آگهی",
  VIEWING_DONE: "بازدید انجام‌شده",
  STAGE_CHANGE: "تغییر مرحله",
  OTHER: "سایر",
};

// سقف روزهای بدون فعالیت برای هر مرحله — اگر مشتری بیشتر از این بدون هیچ فعالیتی بماند، «راکد» است.
// مرحله‌های پایانی (WON / FAILED / LOST) سقف ندارند و هرگز راکد حساب نمی‌شوند.
export const STALE_DAY_LIMITS: Record<string, number> = {
  NEW: 3,
  INITIAL_CONTACT: 3,
  QUALIFIED: 7,
  VIEWING: 7,
  CONTRACT: 7,
};

/** اگر مشتری از آخرین فعالیتش بیش از سقف مرحله‌اش گذشته باشد، {days, limit} را برمی‌گرداند؛ وگرنه null */
export function getStaleInfo(
  stage: string,
  lastActivityAt: Date | string | null | undefined,
  now: Date = new Date(),
): { days: number; limit: number } | null {
  const limit = STALE_DAY_LIMITS[stage];
  if (!limit || !lastActivityAt) return null;
  const last = new Date(lastActivityAt).getTime();
  if (Number.isNaN(last)) return null;
  const days = Math.floor((now.getTime() - last) / 86_400_000);
  return days > limit ? { days, limit } : null;
}

export const MATCHING_CONFIG = {
  budgetWeight: 0.5,
  sizeWeight: 0.3,
  bedsWeight: 0.2,
  threshold: 70,
  /** بازار ایران: هر ۳۰ میلیون ودیعه ≈ ۱ میلیون اجاره ماهانه */
  depositToMonthlyDivisor: BigInt("30000000"),
} as const;
