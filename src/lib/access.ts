// Masking ≠ Authorization — این لایه Defense in Depth است، چک دسترسی باید جداگانه انجام شود
import type { Property, Customer, User } from "@prisma/client";

export function canAccessCustomer(user: { id: string; role: string }, customer: { assignedAgentId: string }): boolean {
  if (user.role === "OWNER") return true;
  return customer.assignedAgentId === user.id;
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

export function maskPropertyForTeam<T extends Record<string, unknown>>(property: T): T {
  // برای فایل TEAM_VISIBLE دیگران: فقط نوع/منطقه/قیمت کلی
  const masked = { ...property };
  delete (masked as Record<string, unknown>).address;
  delete (masked as Record<string, unknown>).ownerId;
  return masked;
}

export function maskSensitiveFields(data: Record<string, unknown>): Record<string, unknown> {
  const sensitive = ["password", "passwordHash", "tokenHash", "phone"];
  const cleaned = { ...data };
  for (const key of sensitive) {
    if (key in cleaned) delete cleaned[key];
  }
  return cleaned;
}
