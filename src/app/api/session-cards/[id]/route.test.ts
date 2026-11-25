// ویرایش کارت جلسه — روش دریافت بیعانه فقط با بیعانهٔ پرداخت‌شده
// ذخیره می‌شود و با پرداخت‌نشده شدن بیعانه پاک می‌شود (null).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { PATCH } from "./route";
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
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

const existingCard = vi.hoisted(() => ({
  current: {
    id: "sc1",
    advisorId: "u-owner",
    status: "PENDING",
    depositPaid: true,
    depositMethod: "POS",
  } as Record<string, unknown>,
}));
const prismaMock = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  property: { findUnique: vi.fn() },
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  sessionCard: { findUnique: vi.fn(), update: vi.fn() },
  activity: { create: vi.fn() },
  notification: { createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };

function setSession() {
  authSession.current = {
    user: { ...OWNER, active: true, tokenVersion: 1, permissions: {} },
    payload: { userId: OWNER.id, role: OWNER.role, tokenVersion: 1 },
  };
}

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/session-cards/sc1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/session-cards/[id] — deposit method follows depositPaid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession();
    existingCard.current = {
      id: "sc1",
      advisorId: "u-owner",
      status: "PENDING",
      depositPaid: true,
      depositMethod: "POS",
    };
    prismaMock.sessionCard.findUnique.mockImplementation(async () => ({ ...existingCard.current }));
    prismaMock.sessionCard.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...existingCard.current,
      ...data,
    }));
  });

  it("clears the stored deposit method when the deposit is marked unpaid", async () => {
    const res = await PATCH(patchReq({ depositPaid: false }), {
      params: Promise.resolve({ id: "sc1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.sessionCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ depositPaid: false, depositMethod: null }),
      }),
    );
  });

  it("stores the new method when only the method changes on a paid card", async () => {
    const res = await PATCH(patchReq({ depositMethod: "CARD" }), {
      params: Promise.resolve({ id: "sc1" }),
    });
    expect(res.status).toBe(200);
    const data = prismaMock.sessionCard.update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.depositMethod).toBe("CARD");
    expect(data).not.toHaveProperty("depositPaid");
  });

  it("ignores a method-only change on an unpaid card", async () => {
    existingCard.current = {
      ...existingCard.current,
      depositPaid: false,
      depositMethod: null,
    };
    const res = await PATCH(patchReq({ depositMethod: "CARD" }), {
      params: Promise.resolve({ id: "sc1" }),
    });
    expect(res.status).toBe(400);
    expect(prismaMock.sessionCard.update).not.toHaveBeenCalled();
  });

  it("stores the method when the deposit is marked paid in the same edit", async () => {
    existingCard.current = {
      ...existingCard.current,
      depositPaid: false,
      depositMethod: null,
    };
    const res = await PATCH(patchReq({ depositPaid: true, depositMethod: "CARD" }), {
      params: Promise.resolve({ id: "sc1" }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.sessionCard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ depositPaid: true, depositMethod: "CARD" }),
      }),
    );
  });
});
