// Masking ≠ Authorization — این لایه Defense in Depth است، چک دسترسی باید جداگانه انجام شود

export function canAccessCustomer(user: { id: string; role: string }, customer: { assignedAgentId: string }): boolean {
  if (user.role === "OWNER") return true;
  return customer.assignedAgentId === user.id;
}

/** حذف (soft-delete) رکوردهای اصلی فقط با نقش مدیر */
export function canDeleteEntity(user: { role: string }): boolean {
  return user.role === "OWNER";
}

export function canAccessPropertyFull(
  user: { id: string; role: string },
  property: { listedById: string; visibility: string }
): boolean {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  if (property.visibility === "TEAM_VISIBLE") return true;
  return false;
}

export async function hasRestrictedAccess(
  prisma: { propertyAccess: { findFirst: (args: unknown) => Promise<unknown> } },
  propertyId: string,
  userId: string
): Promise<boolean> {
  const access = await prisma.propertyAccess.findFirst({
    where: {
      propertyId,
      userId,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
  return !!access;
}

// برای فایل TEAM_VISIBLE که متعلق به مشاور دیگر است: فقط نوع/منطقه/قیمت کلی — نه آدرس دقیق و نه اطلاعات مالک
export function maskPropertyForTeam<T extends Record<string, unknown>>(property: T): T {
  const masked = { ...property } as Record<string, unknown>;
  // آدرس دقیق و هویت مالک برای فایل TEAM_VISIBLE دیگران دیده نمی‌شود
  delete masked.address;
  delete masked.ownerId;
  delete masked.owner;
  if (masked.listedBy && typeof masked.listedBy === "object") {
    const lb = { ...(masked.listedBy as Record<string, unknown>) };
    delete lb.phone;
    masked.listedBy = lb;
  }
  return masked as T;
}

export function maskSensitiveFields(data: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "passwordHash", "tokenHash", "phone"];
  const cleaned = { ...data };
  for (const key of sensitive) {
    if (key in cleaned) delete cleaned[key];
  }
  return cleaned;
}
