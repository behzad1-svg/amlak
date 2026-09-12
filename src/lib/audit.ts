import { prisma } from "./prisma";
import { maskSensitiveFields } from "./access";

const SENSITIVE_FIELDS = ["password", "passwordHash", "tokenHash", "owner", "phone"];

function sanitizeValue(value: Record<string, unknown> | null): string | null {
  if (!value) return null;
  const cleaned = { ...value };
  for (const field of SENSITIVE_FIELDS) {
    if (field in cleaned) delete cleaned[field];
  }
  return JSON.stringify(cleaned, (_key, val) =>
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
  } catch {
    // Audit log failure should not break the main operation
  }
}
