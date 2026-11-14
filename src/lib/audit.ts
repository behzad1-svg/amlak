import { prisma } from "./prisma";
import { maskSensitiveFields } from "./access";

const SENSITIVE_FIELDS = ["password", "passwordHash", "tokenHash", "owner", "phone"];

function sanitizeValue(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  // پاک‌سازی عمیق: فیلدهای حساس در هر عمقی از آبجکت حذف می‌شوند، نه فقط سطح اول
  const deep = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(deep);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE_FIELDS.includes(k)) continue;
        out[k] = deep(val);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(deep(value), (_key, val) =>
    typeof val === "bigint" ? val.toString() : val
  );
}

export async function createAuditLog(params: {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        oldValue: sanitizeValue(params.newValue ? maskSensitiveFields(params.oldValue ?? {}) : params.oldValue as Record<string, unknown> | null),
        newValue: sanitizeValue(params.newValue as Record<string, unknown> | null),
        ipAddress: params.ipAddress,
      },
    });
  } catch (e) {
    // Audit log failure should not break the main operation — but it must be visible
    console.error("[audit] createAuditLog failed:", e instanceof Error ? e.message : e);
  }
}
