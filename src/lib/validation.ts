import { z } from "zod";

export const loginSchema = z.object({
  phone: z.string().min(1, "شماره تماس الزامی است"),
  password: z.string().min(1, "رمز عبور الزامی است"),
});

const phoneSchema = z.string().regex(/^[0-9]{10,15}$/, "شماره تماس فقط عدد و ۱۰ تا ۱۵ رقم");
const passwordSchema = z.string().min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد").max(100);

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
  password: passwordSchema.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "رمز فعلی الزامی است"),
  newPassword: passwordSchema,
});

export const customerCreateSchema = z.object({
  name: z.string().min(1, "نام و نام خانوادگی الزامی است").max(200),
  phone: z.string().regex(/^[0-9]{10,15}$/, "شماره تماس فقط عدد و ۱۰ تا ۱۵ رقم"),
  type: z.enum(["BUYER", "SELLER", "TENANT", "OWNER"]),
  stage: z.enum(["NEW", "INITIAL_CONTACT", "QUALIFIED", "VIEWING", "CONTRACT", "WON", "FAILED", "LOST"]).optional(),
  temperature: z.enum(["HOT", "WARM", "COLD"]).optional(),
  source: z.enum(["INSTAGRAM", "DIVAR", "DIRECT_CALL", "REFERRAL", "SIGN_BOARD", "WEBSITE", "OTHER"]).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  description: z.string().max(3000).optional().nullable(),
  preferredType: z.string().max(30).optional().nullable(),
  preferredDealType: z.enum(["SALE", "RENT"]).optional().nullable(),
  preferredArea: z.string().max(100).optional().nullable(),
  preferredAreas: z.array(z.string().max(100)).max(10).optional().nullable(),
  preferredBeds: z.number().int().min(0).max(20).optional().nullable(),
  preferredSizeMin: z.number().min(0).optional().nullable(),
  preferredSizeMax: z.number().min(0).optional().nullable(),
  budgetMin: z.string().regex(/^[0-9]*$/, "بودجه فقط عدد").optional().nullable(),
  budgetMax: z.string().regex(/^[0-9]*$/, "بودجه فقط عدد").optional().nullable(),
  budgetMaxMonthly: z.string().regex(/^[0-9]*$/, "بودجه فقط عدد").optional().nullable(),
  nextFollowUpAt: z.string().optional().nullable(),
  needsManagerReview: z.boolean().optional(),
  managerReviewReason: z.string().max(1000).optional().nullable(),
  lostReasonCategory: z.enum(["CUSTOMER_WITHDREW", "PRICE_REJECTED", "NO_RESPONSE", "NO_SUITABLE_PROPERTY", "OTHER"]).optional().nullable(),
  lostReasonDetail: z.string().max(1000).optional().nullable(),
  assignedAgentId: z.string().optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial();

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
  status: z.enum(["ACTIVE", "RESERVED", "SOLD", "RENTED"]).optional(),
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
  ownerId: z.string().min(1, "مالک الزامی است"),
  visibility: z.enum(["TEAM_VISIBLE", "RESTRICTED"]).optional(),
  isAdvertised: z.boolean().optional(),
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
});

export const dealCreateSchema = z.object({
  customerId: z.string().min(1),
  propertyId: z.string().min(1),
  status: z.enum(["PENDING", "COMPLETED"]).optional(),
  contractAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  commissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فقط عدد").optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
  dealSalePriceToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealDepositToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealMonthlyRentToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
});

export const dealUpdateSchema = z.object({
  status: z.enum(["PENDING", "COMPLETED", "CANCELED"]).optional(),
  contractAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  commissionToman: z.string().regex(/^[0-9]*$/, "کمیسیون فقط عدد").optional().nullable(),
  commissionPercent: z.number().min(0).max(100).optional().nullable(),
  dealSalePriceToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealDepositToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
  dealMonthlyRentToman: z.string().regex(/^[0-9]*$/, "فقط عدد").optional().nullable(),
});

export const activityCreateSchema = z.object({
  type: z.enum(["CALL", "MESSAGE", "MEETING", "NOTE", "APPRAISAL", "ADVERTISED", "VIEWING_DONE", "STAGE_CHANGE", "OTHER"]),
  customerId: z.string().optional().nullable(),
  propertyId: z.string().optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  durationMinutes: z.number().int().min(0).optional().nullable(),
  costToman: z.number().int().min(0).optional().nullable(),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1, "عنوان الزامی است").max(300),
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
});
