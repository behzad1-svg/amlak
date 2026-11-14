// مجوزهای دانه‌ای هر مشاور — قابل‌گسترش است: برای هر فیچر تازه یک کلید تازه
// به همین فهرست اضافه می‌شود و همان کلید در تنظیمات، تیک می‌خورد.
// مدیر (OWNER) همیشه همه مجوزها را دارد؛ مقدار پیش‌فرض ستون AGENT اعمال می‌شود.
export const PERMISSIONS = [
  { key: "canCreateProperty", label: "ثبت فایل", defaultAgent: true },
  { key: "canArchiveProperty", label: "بایگانی فایل", defaultAgent: true },
  { key: "canDeleteProperty", label: "حذف فایل", defaultAgent: false },
  { key: "canCreateCustomer", label: "ثبت مشتری", defaultAgent: true },
  { key: "canCreateDeal", label: "ثبت معامله", defaultAgent: true },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export type PermissionsMap = Partial<Record<PermissionKey, boolean>>;

export function hasPermission(
  user: { role?: string | null; permissions?: unknown } | null | undefined,
  key: PermissionKey,
): boolean {
  if (!user) return false;
  if (user.role === "OWNER") return true;
  const perms = (user.permissions ?? {}) as Record<string, unknown>;
  if (typeof perms[key] === "boolean") return perms[key] as boolean;
  return PERMISSIONS.find((p) => p.key === key)?.defaultAgent ?? false;
}

/** فقط کلیدهای شناخته‌شده را نگه می‌دارد؛ ورودی نامعتبر را دور می‌ریزد. */
export function sanitizePermissions(input: unknown): PermissionsMap {
  if (!input || typeof input !== "object") return {};
  const out: PermissionsMap = {};
  for (const perm of PERMISSIONS) {
    const v = (input as Record<string, unknown>)[perm.key];
    if (typeof v === "boolean") out[perm.key] = v;
  }
  return out;
}
