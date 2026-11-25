// ثبت کارت جلسه — دو پیامک: به مدیر اصلی (محمد ادیم، با شماره‌اش پیدا
// می‌شود) و مدیر قرارداد انتخاب‌شده (بعد از ذخیرهٔ کارت، و هرگز مانع
// ثبت کارت نمی‌شود: خطای هر پیامک فقط در لاگ سرور می‌ماند؛ اگر مدیر
// قرارداد همان مدیر اصلی باشد فقط یک پیامک می‌رود).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import type { MockSession } from "@/lib/test-session";

const authSession = vi.hoisted(() => ({
  current: null as MockSession | null,
}));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => authSession.current,
  validateSession: async () => authSession.current,
  setAuthCookie: async () => {},
  clearAuthCookie: async () => {},
  hashPassword: async () => {
    throw new Error("hashPassword is not mocked here");
  },
  verifyPassword: async () => false,
  signToken: async () => {
    throw new Error("signToken is not mocked here");
  },
  verifyToken: async () => null,
  invalidateUserTokens: async () => {},
  COOKIE_NAME_EXPORT: "saj_token",
}));

const smsMock = vi.hoisted(() => ({ sendSms: vi.fn() }));
vi.mock("@/lib/sms", async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  sendSms: smsMock.sendSms,
}));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

const prismaMock = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  property: { findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  sessionCard: { create: vi.fn() },
  activity: { create: vi.fn() },
  notification: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const MANAGER = { id: "u-mgr", name: "مدیر قرارداد", active: true, isContractManager: true, phone: "09170000001" };
const ADIM = { id: "u-adim", name: "محمد ادیم", active: true, isContractManager: true, phone: "09173700135" };
const SMS_TEXT = "مدیر ساج کارت جلسه ثبت کرد لطفا سایت رو چک کنید — املاک ساج";

function setSession() {
  authSession.current = {
    user: { ...OWNER, active: true, tokenVersion: 1, permissions: {} },
    payload: { userId: OWNER.id, role: OWNER.role, tokenVersion: 1 },
  };
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/session-cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/session-cards — two SMS: main manager + contract manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession();
    smsMock.sendSms.mockResolvedValue(undefined);
    prismaMock.customer.findUnique.mockResolvedValue({
      id: "c1", name: "مشتری یک", deletedAt: null, assignedAgentId: OWNER.id,
    });
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where?: { id?: string; phone?: string } }) => {
      if (where?.phone === ADIM.phone) return ADIM;
      if (where?.id === ADIM.id) return ADIM;
      if (where?.id === MANAGER.id) return MANAGER;
      return null;
    });
    prismaMock.user.findMany.mockResolvedValue([{ id: OWNER.id }]);
    prismaMock.sessionCard.create.mockResolvedValue({
      id: "sc1", customerId: "c1", advisorId: OWNER.id, contractManagerId: MANAGER.id,
      scheduledAt: new Date("2026-11-25T10:00:00Z"),
    });
    prismaMock.activity.create.mockResolvedValue({});
    prismaMock.notification.createMany.mockResolvedValue({});
  });

  it("sends two SMS with the exact text — to the main manager and the selected contract manager", async () => {
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: MANAGER.id }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(2);
    expect(smsMock.sendSms).toHaveBeenCalledWith(ADIM.phone, SMS_TEXT);
    expect(smsMock.sendSms).toHaveBeenCalledWith(MANAGER.phone, SMS_TEXT);
  });

  it("sends only the main-manager SMS when no contract manager is selected", async () => {
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00" }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(smsMock.sendSms).toHaveBeenCalledWith(ADIM.phone, SMS_TEXT);
  });

  it("sends only to the main manager when the contract manager has no phone", async () => {
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where?: { id?: string; phone?: string } }) => {
      if (where?.phone === ADIM.phone) return ADIM;
      if (where?.id === MANAGER.id) return { ...MANAGER, phone: null };
      return null;
    });
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: MANAGER.id }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(smsMock.sendSms).toHaveBeenCalledWith(ADIM.phone, SMS_TEXT);
  });

  it("sends only once when the contract manager is the main manager", async () => {
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: ADIM.id }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(smsMock.sendSms).toHaveBeenCalledWith(ADIM.phone, SMS_TEXT);
  });

  it("sends only to the contract manager when the main manager is not found", async () => {
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where?: { id?: string; phone?: string } }) => {
      if (where?.id === MANAGER.id) return MANAGER;
      return null;
    });
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: MANAGER.id }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(smsMock.sendSms).toHaveBeenCalledWith(MANAGER.phone, SMS_TEXT);
  });

  it("sends only to the contract manager when the main manager is inactive", async () => {
    prismaMock.user.findUnique.mockImplementation(async ({ where }: { where?: { id?: string; phone?: string } }) => {
      if (where?.phone === ADIM.phone) return { ...ADIM, active: false };
      if (where?.id === MANAGER.id) return MANAGER;
      return null;
    });
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: MANAGER.id }));
    expect(res.status).toBe(201);
    expect(smsMock.sendSms).toHaveBeenCalledTimes(1);
    expect(smsMock.sendSms).toHaveBeenCalledWith(MANAGER.phone, SMS_TEXT);
  });

  it("card is still created (201) and the other SMS still goes out when one SMS send fails", async () => {
    smsMock.sendSms.mockRejectedValueOnce(new Error("sms.ir down"));
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00", contractManagerId: MANAGER.id }));
    expect(res.status).toBe(201);
    expect(prismaMock.sessionCard.create).toHaveBeenCalled();
    expect(smsMock.sendSms).toHaveBeenCalledTimes(2);
  });

  it("stores the deposit method when the deposit is paid", async () => {
    const res = await POST(
      postReq({
        customerId: "c1",
        scheduledAt: "2026-11-25T10:00:00",
        depositPaid: true,
        depositMethod: "POS",
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.sessionCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ depositPaid: true, depositMethod: "POS" }),
      }),
    );
  });

  it("stores null for the deposit method when the deposit is not paid", async () => {
    const res = await POST(
      postReq({
        customerId: "c1",
        scheduledAt: "2026-11-25T10:00:00",
        depositPaid: false,
        depositMethod: "CARD",
      }),
    );
    expect(res.status).toBe(201);
    expect(prismaMock.sessionCard.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ depositPaid: false, depositMethod: null }),
      }),
    );
  });

  it("rejects an invalid deposit method", async () => {
    const res = await POST(
      postReq({
        customerId: "c1",
        scheduledAt: "2026-11-25T10:00:00",
        depositPaid: true,
        depositMethod: "CASH",
      }),
    );
    expect(res.status).toBe(400);
    expect(prismaMock.sessionCard.create).not.toHaveBeenCalled();
  });

  it("401 without a session", async () => {
    authSession.current = null;
    const res = await POST(postReq({ customerId: "c1", scheduledAt: "2026-11-25T10:00:00" }));
    expect(res.status).toBe(401);
    expect(smsMock.sendSms).not.toHaveBeenCalled();
  });
});
