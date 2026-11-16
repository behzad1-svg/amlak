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
  property: { listedById: string; visibility: string; isOfficeFile?: boolean }
): boolean {
  if (user.role === "OWNER") return true;
  if (property.listedById === user.id) return true;
  // فایل دفتر: همه مشاورها اطلاعات کامل را می‌بینند — حتی مشاورهای تازه‌اضافه‌شده
  if (property.isOfficeFile) return true;
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
  // آدرس دقیق، هویت مالک و توضیحات فایل برای TEAM_VISIBLE دیگران دیده نمی‌شود
  // (توضیحات معمولاً نکته‌های مذاکره با مالک است)
  delete masked.address;
  delete masked.accessList;
  delete masked.ownerId;
  delete masked.owner;
  delete masked.description;
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

// همگام‌سازی دسترسی کامل فایل با لیست تیک‌خورده در فرم ثبت/ویرایش.
// فقط مشاورهای فعالِ غیر از ثبت‌کننده؛ مدیر همه‌چیز را می‌بیند و نیازی به دسترسی ندارد.
// دسترسی‌های فعالِ خارج از لیست باطل می‌شوند؛ به تازه‌تیک‌خورده‌ها اعلان می‌رسد.
// خروجی: شناسه ردیف‌های دسترسیِ تازه‌ساخته‌شده (برای لاگ حسابرسی در مسیر API).
export async function syncPropertyAccess(
  prisma: {
    user: { findMany: (args: unknown) => Promise<{ id: string }[]> };
    propertyAccess: {
      findMany: (args: unknown) => Promise<{ id: string; userId: string }[]>;
      updateMany: (args: unknown) => Promise<unknown>;
      upsert: (args: unknown) => Promise<{ id: string }>;
    };
    notification: { create: (args: unknown) => Promise<unknown> };
  },
  propertyId: string,
  propertyTitle: string,
  userIds: string[],
  grantedById: string
): Promise<{ grantedIds: string[] }> {
  const valid = await prisma.user.findMany({
    where: { id: { in: userIds }, active: true, role: "AGENT" },
    select: { id: true },
  });
  const wanted = new Set(valid.map((u) => u.id).filter((id) => id !== grantedById));
  const active = await prisma.propertyAccess.findMany({
    where: { propertyId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true, userId: true },
  });
  const toRevoke = active.filter((a) => !wanted.has(a.userId));
  if (toRevoke.length > 0) {
    await prisma.propertyAccess.updateMany({
      where: { id: { in: toRevoke.map((a) => a.id) } },
      data: { revokedAt: new Date() },
    });
  }
  const have = new Set(active.map((a) => a.userId));
  const fresh = [...wanted].filter((id) => !have.has(id));
  const grantedIds: string[] = [];
  for (const userId of fresh) {
    const row = await prisma.propertyAccess.upsert({
      where: { propertyId_userId: { propertyId, userId } },
      update: { grantedById, grantedAt: new Date(), revokedAt: null, expiresAt: null, reason: null },
      create: { propertyId, userId, grantedById },
    });
    grantedIds.push(row.id);
    await prisma.notification.create({
      data: {
        userId,
        type: "ACCESS_GRANTED",
        priority: "NORMAL",
        relatedType: "Property",
        relatedId: propertyId,
        message: `دسترسی به فایل "${propertyTitle}" به شما داده شد.`,
      },
    });
  }
  return { grantedIds };
}
