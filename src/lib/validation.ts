import { z } from "zod";
import { toEnDigits } from "./utils";

/**
 * اعتبارسنجی پارامترهای عددی query string؛
 * اگر پارامتری نامعتبر باشد نام آن را برمی‌گرداند، وگرنه null.
 * (جلوگیری از ۵۰۰ به‌جای ۴۰۰ موقع BigInt/parseInt/parseFloat روی ورودی نامعتبر)
 * number=true یعنی عدد با اعشار اختیاری هم قبول است (برای parseFloat).
 * bigint=true یعنی مقدار باید در bigint پستگرس جا شود (برای BigInt).
 */
export function findInvalidQueryParam(
  entries: { name: string; value: string | null; number?: boolean; bigint?: boolean }[],
): string | null {
  for (const { name, value, number, bigint } of entries) {
    if (!value) continue;
    const ok = number ? /^\d+(\.\d+)?$/.test(value) : /^\d+$/.test(value);
    if (!ok) return name;
    // bigint=true: مقدار باید در bigint پستگرس جا شود؛ وگرنه BigInt() در
    // جاوااسکریپت می‌گذرد ولی Prisma موقع ارسال به دیتابیس ۵۰۰ می‌دهد.
    if (bigint) {
      try {
        if (BigInt(value) > PG_BIGINT_MAX) return name;
      } catch {
        return name;
      }
    }
  }
  return null;
}

/** سقف bigint در PostgreSQL. */
export const PG_BIGINT_MAX = BigInt("9223372036854775807");

/**
 * پارس امن رشته به BigInt برای فیلترهای کوئری؛
 * خالی، غیرعددی یا بزرگ‌تر از سقف bigint پستگرس → null (به‌جای ۵۰۰).
 */
export function safeBigInt(value: string | null | undefined): bigint | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const n = BigInt(value);
  return n <= PG_BIGINT_MAX ? n : null;
}


export const loginSchema = z.object({
  phone: z.string().min(1, "شماره تماس الزامی است"),
  password: z.string().min(1, "رمز عبور الزامی است"),
});

const phoneSchema = z.preprocess(
  (v) =>
    typeof v === "string"
      ? toEnDigits(v).replace(/[\s-]/g, "").replace(/^(?:\+98|0098)/, "0")
      : v,
  z.string().regex(/^[0-9]{11}$/, "شماره تماس باید ۱۱ رقم باشد"),
);
const passwordSchema = z
  .string()
  .min(12, "رمز عبور باید حداقل ۱۲ کاراکتر باشد")
  .max(100)
  .regex(/[A-Za-z]/, "رمز عبور باید حداقل یک حرف لاتین داشته باشد")
  .regex(/[0-9]/, "رمز عبور باید حداقل یک رقم داشته باشد");

export const userCreateSchema = z.object({
  name: z.string().min(1, "نام الزامی است").max(120),
  phone: phoneSchema,
  password: passwordSchema,
  role: z.enum(["OWNER", "AGENT"]).optional(),
});

export const userUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  role: z.enum(["OWNER", "AGENT"]).optional(),
  active: z.boolean().optional(),
  isContractManager: z.boolean().optional(),
  permissions: z.record(z.string(), z.boolean()).optional(),
  password: passwordSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "رمز فعلی الزامی است"),
  newPassword: passwordSchema,
});

/// رشتهٔ بودجه: خالی یا null یعنی بدون بودجه؛ در غیر این صورت باید عدد صحیح مثبت باشد.
/// «0» قبول نیست — در تطبیق، سقف صفر باعث تقسیم بر صفر می‌شود.
const positiveBudgetString = z
  .string()
  .regex(/^[0-9]*$/, "بودجه فقط عدد")
  .refine((v) => v === "" || (/^[0-9]+$/.test(v) && BigInt(v) > BigInt(0)), "بودجه باید بیشتر از صفر باشد");

/**
 * تبدیل رشتهٔ بودجه به BigInt؛ "0" (و خالی/null) یعنی بدون بودجه.
 * دفاع دوم بعد از اعتبارسنجی zod — رکوردهای قدیمی با بودجهٔ صفر هم این‌طور نرمال می‌شوند.
 */
export function budgetStringToBigInt(value: string | null | undefined): bigint | null {
  if (!value) return null;
  const n = BigInt(value);
  return n > BigInt(0) ? n : null;
}

export const customerCreateSchema = z.object({
  name: z.string().min(1, "نام و نام خانوادگی الزامی است").max(200),
  phone: z.string().regex(/^[0-9]{11}$/, "شماره تماس باید ۱۱ رقم باشد"),
  type: z.enum(["BUYER", "SELLER", "TENANT", "OWNER"]),
  stage: z.enum(["NEW", "INITIAL_CONTACT", "QUALIFIED", "VIEWING", "CONTRACT", "WON", "FAILED", "LOST"]).optional(),
  temperature: z.enum(["HOT", "WARM", "COLD"]).optional(),
  source: z.enum(["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "IN_PERSON", "ADVERTISEMENT", "OTHER", "FILE_FINDING"]).optional().nullable(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  notes: z.string().max(2000).optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  preferredType: z.string().max(30).optional().nullable(),
  preferredDealType: z.enum(["SALE", "RENT"]).optional().nullable(),
  preferredArea: z.string().max(100).optional().nullable(),
  preferredAreas: z.array(z.string().max(100)).max(10).optional().nullable(),
  preferredBeds: z.number().int().min(0).max(20).optional().nullable(),
  preferredSizeMin: z.number().min(0).optional().nullable(),
  preferredSizeMax: z.number().min(0).optional().nullable(),
  budgetMin: positiveBudgetString.optional().nullable(),
  budgetMax: positiveBudgetString.optional().nullable(),
  budgetMaxMonthly: positiveBudgetString.optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  needsManagerReview: z.boolean().optional(),
  managerReviewReason: z.string().max(1000).optional().nullable(),
  lostReasonCategory: z.enum(["CUSTOMER_WITHDREW", "PRICE_REJECTED", "NO_RESPONSE", "NO_SUITABLE_PROPERTY", "OTHER"]).optional().nullable(),
  lostReasonDetail: z.string().max(1000).optional().nullable(),
  assignedAgentId: z.string().optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

/// Phonebook (Didar-style): name + mobile required, like Didar's family-name rule.
export const phonebookCreateSchema = z.object({
  name: z.string().min(1, "نام الزامی است").max(120),
  phone: z.string().regex(/^[0-9]{11}$/, "شماره تماس باید ۱۱ رقم باشد"),
  phone2: z.string().regex(/^[0-9]{11}$/, "شماره دوم باید ۱۱ رقم باشد").optional().nullable(),
  email: z.string().email("ایمیل معتبر نیست").max(200).optional().nullable(),
  group: z.enum(["BUILDER", "OWNER", "BUYER", "COLLEAGUE", "OTHER"]).optional(),
  tags: z.array(z.string().min(1).max(30)).max(10).optional(),
  notes: z.string().max(2000).optional().nullable(),
  isVip: z.boolean().optional(),
  isPinned: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});

export const phonebookUpdateSchema = phonebookCreateSchema.partial();

export const followUpCreateSchema = z.object({
  dueAt: z.string().min(1, "تاریخ پیگیری الزامی است"),
  note: z.string().max(1000).optional().nullable(),
});

export const followUpUpdateSchema = z.object({
  dueAt: z.string().optional(),
  note: z.string().max(1000).optional().nullable(),
  done: z.boolean().optional(),
});

export const propertyCreateSchema = z.object({
  title: z.string().min(1, "عنوان الزامی است").max(300),
  type: z.string().min(1).max(30),
  dealType: z.enum(["SALE", "RENT"]),
  salePriceToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  depositToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  monthlyRentToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  status: z.enum(["ACTIVE", "SOLD", "RENTED", "ARCHIVED"]).optional(),
  source: z.enum(["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "IN_PERSON", "ADVERTISEMENT", "OTHER", "FILE_FINDING"]).optional().nullable(),
  sizeSqm: z.number().min(0).optional().nullable(),
  beds: z.number().int().min(0).max(20).optional().nullable(),
  builtYear: z.number().int().min(1300).max(1500).optional().nullable(),
  floor: z.number().int().optional().nullable(),
  totalFloors: z.number().int().optional().nullable(),
  unitsPerFloor: z.number().int().min(0).max(50).optional().nullable(),
  unitCount: z.number().int().min(0).max(500).optional().nullable(),
  landSizeSqm: z.number().min(0).optional().nullable(),
  passageWidth: z.number().min(0).optional().nullable(),
  buildingFrontage: z.number().min(0).optional().nullable(),
  buildingFloors: z.number().int().min(0).max(30).optional().nullable(),
  hasParking: z.boolean().optional(),
  hasStorage: z.boolean().optional(),
  hasElevator: z.boolean().optional(),
  hasTerrace: z.boolean().optional(),
  hasRenovated: z.boolean().optional(),
  isNewBuild: z.boolean().optional(),
  region: z.string().min(1, "منطقه الزامی است").max(100),
  address: z.string().max(1000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  ownerId: z.string().min(1, "مالک الزامی است"),
  visibility: z.enum(["TEAM_VISIBLE", "RESTRICTED"]).optional(),
  /// فایل دفتر — همه مشاورها به اطلاعات کامل فایل دسترسی دارند
  isOfficeFile: z.boolean().optional(),
  /// مشاورهایی که به اطلاعات کامل فایل دسترسی دارند (تیک در فرم ثبت/ویرایش)
  accessUserIds: z.array(z.string()).optional(),
  isAdvertised: z.boolean().optional(),
  isAppraised: z.boolean().optional(),
  appraisedById: z.string().optional().nullable(),
  nextOwnerFollowUpAt: z.string().optional().nullable(),
});

export const propertyUpdateSchema = propertyCreateSchema.partial().omit({ ownerId: true }).extend({
  ownerId: z.string().optional(),
  /// تغییر مشاور ثبت‌کننده/مسئول فایل — فقط مدیر
  listedById: z.string().optional(),
});

export const viewingCreateSchema = z.object({
  customerId: z.string().min(1),
  propertyId: z.string().min(1),
  /// فقط مدیر می‌تواند بازدید را به مشاور دیگر نسبت دهد
  agentId: z.string().optional().nullable(),
  startAt: z.string().min(1, "زمان شروع الزامی است"),
  endAt: z.string().optional().nullable(),
  status: z.enum(["SCHEDULED", "DONE", "CANCELED"]).optional(),
  feedback: z.string().max(2000).optional().nullable(),
  /// گزارش سه‌ضربه‌ای بازدید — فقط با ثبت بازدید انجام‌شده معنا دارد
  rating: z.enum(["LIKED", "MIXED", "NOT_INTERESTED"]).optional(),
  reportComment: z.string().max(500).optional().nullable(),
});

/// کارت جلسه — هماهنگی پیش از قرارداد بین مشاور و مدیر
export const sessionCardCreateSchema = z.object({
  customerId: z.string().min(1, "مشتری الزامی است"),
  propertyId: z.string().optional().nullable(),
  scheduledAt: z.string().min(1, "تاریخ و ساعت جلسه الزامی است"),
  cashAmountToman: z.string().regex(/^[0-9]*$/, "پول نقد فقط عدد").optional().nullable(),
  depositAmountToman: z.string().regex(/^[0-9]*$/, "مبلغ رهن فقط عدد").optional().nullable(),
  rentAmountToman: z.string().regex(/^[0-9]*$/, "اجاره فقط عدد").optional().nullable(),
  intent: z.string().max(100).optional().nullable(),
  sellerShiriniToman: z.string().regex(/^[0-9]*$/, "شیرینی فقط عدد").optional().nullable(),
  cooperatingAdvisorIds: z.array(z.string().min(1)).max(3, "حداکثر ۳ مشاور همکار").optional(),
  contractManagerId: z.string().optional().nullable(),
  depositPaid: z.boolean().optional().nullable(),
  paymentTerms: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

/// مدیر: تغییر وضعیت + نظر؛ سازنده فقط لغو کارت خودش (status=CANCELLED)
/// ویرایش محتوا (فقط سازنده، فقط PENDING) — فیلدها مثل ساخت، همه اختیاری
export const sessionCardUpdateSchema = z.object({
  status: z.enum(["CONFIRMED", "CANCELLED"]).optional(),
  managerNote: z.string().max(2000).optional().nullable(),
  customerId: z.string().min(1, "مشتری الزامی است").optional(),
  propertyId: z.string().optional().nullable(),
  scheduledAt: z.string().min(1, "تاریخ و ساعت جلسه الزامی است").optional(),
  cashAmountToman: z.string().regex(/^[0-9]*$/, "پول نقد فقط عدد").optional().nullable(),
  depositAmountToman: z.string().regex(/^[0-9]*$/, "مبلغ رهن فقط عدد").optional().nullable(),
  rentAmountToman: z.string().regex(/^[0-9]*$/, "اجاره فقط عدد").optional().nullable(),
  intent: z.string().max(100).optional().nullable(),
  sellerShiriniToman: z.string().regex(/^[0-9]*$/, "شیرینی فقط عدد").optional().nullable(),
  cooperatingAdvisorIds: z.array(z.string().min(1)).max(3, "حداکثر ۳ مشاور همکار").optional(),
  contractManagerId: z.string().optional().nullable(),
  depositPaid: z.boolean().optional().nullable(),
  paymentTerms: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
});

export const dealCreateSchema = z.object({
  customerId: z.string().min(1),
  propertyId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  contractAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  commissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فقط عدد").optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
  /// کمیسیون دوطرفه (از ۲ آذر ۱۴۰۵) — مثل مسیر ویرایش؛ جمع‌های قدیمی از روی طرف‌ها مشتق می‌شوند
  sellerCommissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فروشنده فقط عدد").optional().nullable(),
  sellerCommissionPercent: z.number().min(0).max(100).optional().nullable(),
  buyerCommissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون خریدار فقط عدد").optional().nullable(),
  buyerCommissionPercent: z.number().min(0).max(100).optional().nullable(),
  dealSalePriceToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealDepositToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealMonthlyRentToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
});

export const dealShareInputSchema = z.object({
  userId: z.string().min(1).optional().nullable(),
  name: z.string().max(120).optional().nullable(),
  pct: z.number().min(0.01, "درصد سهم باید بیشتر از صفر باشد").max(100, "درصد سهم حداکثر ۱۰۰ است"),
  shiriniPct: z.number().min(0, "درصد شیرینی سهم باید بین ۰ تا ۱۰۰ باشد").max(100, "درصد شیرینی سهم باید بین ۰ تا ۱۰۰ باشد").optional().nullable(),
});

export const shareSettleSchema = z.object({
  settled: z.boolean(),
});

export const dealUpdateSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "CANCELED"]).optional(),
  contractAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  commissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فقط عدد").optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
  sellerShiriniToman: z.string().regex(/^[0-9]*$/, "شیرینی فقط عدد").optional().nullable(),
  buyerShiriniToman: z.string().regex(/^[0-9]*$/, "شیرینی فقط عدد").optional().nullable(),
  discountToman: z.string().regex(/^[0-9]*$/, "تخفیف فقط عدد").optional().nullable(),
  /// کمیسیون دوطرفه (از ۲ آذر ۱۴۰۵) — هر طرف جدا: فروشنده/خریدار، اجاره: مالک/مستاجر
  sellerCommissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فروشنده فقط عدد").optional().nullable(),
  sellerCommissionPercent: z.number().min(0).max(100).optional().nullable(),
  buyerCommissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون خریدار فقط عدد").optional().nullable(),
  buyerCommissionPercent: z.number().min(0).max(100).optional().nullable(),
  sellerReceivedToman: z.string().regex(/^[0-9]*$/, "دریافتی فروشنده فقط عدد").optional().nullable(),
  buyerReceivedToman: z.string().regex(/^[0-9]*$/, "دریافتی خریدار فقط عدد").optional().nullable(),
  sellerDiscountToman: z.string().regex(/^[0-9]*$/, "تخفیف فروشنده فقط عدد").optional().nullable(),
  buyerDiscountToman: z.string().regex(/^[0-9]*$/, "تخفیف خریدار فقط عدد").optional().nullable(),
  dealSalePriceToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealDepositToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealMonthlyRentToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  /// سهم‌بندی کمیسیون — فقط مدیر؛ officePct و shares همیشه با هم می‌آیند
  officePct: z.number().min(0, "سهم دفتر باید بین ۰ تا ۱۰۰ باشد").max(100, "سهم دفتر باید بین ۰ تا ۱۰۰ باشد").optional(),
  officeShiriniPct: z.number().min(0, "سهم دفتر از شیرینی باید بین ۰ تا ۱۰۰ باشد").max(100, "سهم دفتر از شیرینی باید بین ۰ تا ۱۰۰ باشد").optional(),
  shares: z.array(dealShareInputSchema).max(10, "حداکثر ۱۰ سهم").optional(),
});

export const cashboxEntrySchema = z.object({
  type: z.enum(["IN", "OUT"]),
  amount: z.string().regex(/^[0-9]+$/, "مبلغ فقط عدد"),
  title: z.string().min(1, "عنوان لازم است").max(200),
  note: z.string().max(2000).optional().nullable(),
  occurredAt: z.string().optional().nullable(),
});

export const commissionSettleSchema = z.object({
  commissionPaid: z.boolean(),
});

export const customerTransferSchema = z.object({
  toAgentId: z.string().min(1, "مشاور مقصد را انتخاب کنید"),
});

export const activityCreateSchema = z.object({
  type: z.enum(["CALL", "MESSAGE", "MEETING", "NOTE", "APPRAISAL", "ADVERTISED", "SESSION_CARD", "VIEWING_DONE", "STAGE_CHANGE", "OTHER"]),
  customerId: z.string().optional().nullable(),
  propertyId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  costToman: z.number().int().min(0).optional().nullable(),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1, "عنوان الزامی است").max(300),
  description: z.string().max(2000).optional().nullable(),
  dueAt: z.string().optional().nullable(),
  priority: z.number().int().min(0).max(2).optional(),
  customerId: z.string().optional().nullable(),
  relatedType: z.string().optional().nullable(),
  relatedId: z.string().optional().nullable(),
});

export const propertyAccessCreateSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().max(500).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  done: z.boolean().optional(),
  priority: z.number().int().min(0).max(2).optional(),
  dueAt: z.string().optional().nullable(),
});

export const viewingUpdateSchema = z.object({
  status: z.enum(["SCHEDULED", "DONE", "CANCELED"]).optional(),
  feedback: z.string().max(2000).optional().nullable(),
  startAt: z.string().optional(),
  endAt: z.string().optional().nullable(),
  /// گزارش سه‌ضربه‌ای بازدید
  rating: z.enum(["LIKED", "MIXED", "NOT_INTERESTED"]).optional().nullable(),
  reportComment: z.string().max(500).optional().nullable(),
});

/// رد کردن تطبیق («علاقه‌ای ندارد»)
export const matchDismissSchema = z.object({
  customerId: z.string().min(1),
  propertyId: z.string().min(1),
});
