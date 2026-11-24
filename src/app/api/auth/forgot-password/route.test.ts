// بازیابی رمز با پیامک — سه مرحله: درخواست کد، بررسی کد، تنظیم رمز تازه.
// پاسخ درخواست برای شمارهٔ ناموجود هم عمومی است؛ کد ۱۰ دقیقه اعتبار دارد
// و یک بار مصرف است؛ پس از تنظیم رمز، نشست‌های قبلی بی‌اعتبار می‌شوند.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as requestCode } from "./route";
import { POST as verifyCode } from "./verify/route";
import { POST as resetPassword } from "./reset/route";

const state = vi.hoisted(() => ({
  rateLimited: false,
  recordReturnsLimited: false,
  templateId: 100000 as number | null,
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: async (v: string) => `hashed-${v}`,
  verifyPassword: async (code: string) => code === "123456",
  invalidateUserTokens: vi.fn(),
}));
vi.mock("@/lib/passwordReset", () => ({
  RESET_CODE_TTL_MS: 10 * 60 * 1000,
  RESET_CODE_MAX_ATTEMPTS: 5,
  generateResetCode: () => "123456",
  forgotRateLimitKeys: () => ({ ipKey: null, phoneKey: "k1", phoneOnlyKey: "k2" }),
  checkForgotRateLimit: async () => !state.rateLimited,
  recordForgotAttempt: async () => state.recordReturnsLimited,
  FORGOT_RATE_LIMIT_MESSAGE: "تعداد تلاش بیش از حد مجاز است، لطفاً ۱۵ دقیقهٔ دیگر تلاش کنید",
}));
const smsMock = vi.hoisted(() => ({ sendVerificationCode: vi.fn() }));
vi.mock("@/lib/sms", () => ({
  sendVerificationCode: smsMock.sendVerificationCode,
  smsVerifyTemplateId: () => state.templateId,
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  passwordResetCode: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const PHONE = "09170000010";
const ACTIVE_USER = { id: "u-a", phone: PHONE, active: true };

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function liveRow(over: Record<string, unknown> = {}) {
  return {
    phone: PHONE,
    codeHash: "hashed-123456",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    attempts: 0,
    verifiedAt: null,
    ...over,
  };
}

describe("POST /api/auth/forgot-password — درخواست کد", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimited = false;
    state.recordReturnsLimited = false;
    state.templateId = 100000;
    smsMock.sendVerificationCode.mockResolvedValue(undefined);
    prismaMock.user.findUnique.mockResolvedValue(ACTIVE_USER);
    prismaMock.passwordResetCode.upsert.mockResolvedValue({});
  });

  it("unknown phone gets the same generic 200 — no code stored, no SMS", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await requestCode(postReq({ phone: PHONE }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain("پیامک می‌شود");
    expect(prismaMock.passwordResetCode.upsert).not.toHaveBeenCalled();
    expect(smsMock.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("inactive user also gets the generic response with no SMS", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...ACTIVE_USER, active: false });
    const res = await requestCode(postReq({ phone: PHONE }));
    expect(res.status).toBe(200);
    expect(prismaMock.passwordResetCode.upsert).not.toHaveBeenCalled();
    expect(smsMock.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("known user: code is stored hashed and SMS is sent with the code", async () => {
    const res = await requestCode(postReq({ phone: PHONE }));
    expect(res.status).toBe(200);
    expect(prismaMock.passwordResetCode.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { phone: PHONE },
        update: expect.objectContaining({ codeHash: "hashed-123456", attempts: 0, verifiedAt: null }),
      })
    );
    expect(smsMock.sendVerificationCode).toHaveBeenCalledWith(PHONE, "123456");
  });

  it("without a configured SMS.ir template the code is stored but no SMS is attempted", async () => {
    state.templateId = null;
    const res = await requestCode(postReq({ phone: PHONE }));
    expect(res.status).toBe(200);
    expect(prismaMock.passwordResetCode.upsert).toHaveBeenCalled();
    expect(smsMock.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("rate limit returns 429", async () => {
    state.rateLimited = true;
    const res = await requestCode(postReq({ phone: PHONE }));
    expect(res.status).toBe(429);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("invalid phone returns 400", async () => {
    const res = await requestCode(postReq({ phone: "123" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/forgot-password/verify — بررسی کد", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimited = false;
    state.recordReturnsLimited = false;
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(liveRow());
    prismaMock.passwordResetCode.update.mockResolvedValue({});
    prismaMock.passwordResetCode.delete.mockResolvedValue({});
  });

  it("correct code marks the row verified", async () => {
    const res = await verifyCode(postReq({ phone: PHONE, code: "123456" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(prismaMock.passwordResetCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { phone: PHONE }, data: expect.objectContaining({ verifiedAt: expect.any(Date) }) })
    );
  });

  it("wrong code returns the generic 400 and bumps attempts", async () => {
    const res = await verifyCode(postReq({ phone: PHONE, code: "000000" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("کد اشتباه");
    expect(prismaMock.passwordResetCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: 1 } })
    );
  });

  it("the fifth wrong attempt deletes the code", async () => {
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(liveRow({ attempts: 4 }));
    const res = await verifyCode(postReq({ phone: PHONE, code: "000000" }));
    expect(res.status).toBe(400);
    expect(prismaMock.passwordResetCode.delete).toHaveBeenCalledWith({ where: { phone: PHONE } });
  });

  it("expired code is deleted and returns the same generic 400", async () => {
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(
      liveRow({ expiresAt: new Date(Date.now() - 1000) })
    );
    const res = await verifyCode(postReq({ phone: PHONE, code: "123456" }));
    expect(res.status).toBe(400);
    expect(prismaMock.passwordResetCode.delete).toHaveBeenCalledWith({ where: { phone: PHONE } });
  });

  it("no code row returns the same generic 400", async () => {
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(null);
    const res = await verifyCode(postReq({ phone: PHONE, code: "123456" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("کد اشتباه");
  });
});

describe("POST /api/auth/forgot-password/reset — تنظیم رمز تازه", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.rateLimited = false;
    state.recordReturnsLimited = false;
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(liveRow({ verifiedAt: new Date() }));
    prismaMock.passwordResetCode.update.mockResolvedValue({});
    prismaMock.passwordResetCode.delete.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue(ACTIVE_USER);
    prismaMock.user.update.mockResolvedValue({});
  });

  it("verified code resets the password, invalidates sessions, deletes the code, audits", async () => {
    const res = await resetPassword(postReq({ phone: PHONE, code: "123456", newPassword: "NewPassword123" }));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACTIVE_USER.id },
        data: { passwordHash: "hashed-NewPassword123" },
      })
    );
    const { invalidateUserTokens } = await import("@/lib/auth");
    expect(invalidateUserTokens).toHaveBeenCalledWith(ACTIVE_USER.id);
    expect(prismaMock.passwordResetCode.delete).toHaveBeenCalledWith({ where: { phone: PHONE } });
    const { createAuditLog } = await import("@/lib/audit");
    expect(createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ACTIVE_USER.id, action: "PASSWORD_RESET_VIA_SMS" })
    );
  });

  it("unverified code returns 400 and does not touch the password", async () => {
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(liveRow());
    const res = await resetPassword(postReq({ phone: PHONE, code: "123456", newPassword: "NewPassword123" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("wrong code returns 400 and does not touch the password", async () => {
    const res = await resetPassword(postReq({ phone: PHONE, code: "000000", newPassword: "NewPassword123" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("expired code returns 400", async () => {
    prismaMock.passwordResetCode.findUnique.mockResolvedValue(
      liveRow({ verifiedAt: new Date(), expiresAt: new Date(Date.now() - 1000) })
    );
    const res = await resetPassword(postReq({ phone: PHONE, code: "123456", newPassword: "NewPassword123" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("weak new password is rejected by validation", async () => {
    const res = await resetPassword(postReq({ phone: PHONE, code: "123456", newPassword: "short" }));
    expect(res.status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
