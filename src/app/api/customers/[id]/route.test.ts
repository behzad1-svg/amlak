// یکتایی تلفن با تغییر نوع مشتری هم باید چک شود (ممیزی ۲.۱):
// خریدار به مالک بدون عوض‌کردن تلفن، نباید از چک یکتایی در برود؛
// و تداخل در سطح دیتابیس (P2002) باید 409 بدهد، نه 500.
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

const prismaMock = vi.hoisted(() => ({
  customer: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  followUp: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));
vi.mock("@/lib/matching", () => ({
  deleteMatchNotificationsForSource: vi.fn(),
  runMatchingForCustomer: vi.fn(),
}));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function existingCustomer() {
  return {
    id: "c1",
    name: "مشتری تست",
    phone: "09170000001",
    type: "BUYER",
    stage: "INITIAL_CONTACT",
    assignedAgentId: OWNER.id,
    deletedAt: null,
    needsManagerReview: false,
    lostReasonCategory: null,
  };
}

function patchCustomer(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("http://localhost/api/customers/c1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "c1" }) }
  );
}

describe("PATCH /api/customers/[id] — یکتایی تلفن با تغییر نوع", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(OWNER);
    prismaMock.customer.findUnique.mockResolvedValue(existingCustomer());
    prismaMock.customer.findFirst.mockResolvedValue(null);
    prismaMock.customer.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...existingCustomer(),
      ...data,
    }));
  });

  it("تغییر نوع خریدار به مالک بدون عوض‌کردن تلفن، وقتی مالکی با همان شماره هست 409 می‌دهد", async () => {
    prismaMock.customer.findFirst.mockResolvedValue({ id: "c2", phone: "09170000001", type: "OWNER" });
    const res = await patchCustomer({ type: "OWNER" });
    expect(res.status).toBe(409);
    // چک یکتایی با تلفنِ ذخیره‌شده (نه تلفن تازه) انجام شده است
    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ phone: "09170000001", type: "OWNER" }),
      })
    );
    expect(prismaMock.customer.update).not.toHaveBeenCalled();
  });

  it("تغییر نوع وقتی تداخلی نیست، موفق است", async () => {
    const res = await patchCustomer({ type: "OWNER" });
    expect(res.status).toBe(200);
    expect(prismaMock.customer.update).toHaveBeenCalled();
  });

  it("تداخل در سطح دیتابیس (P2002) به‌جای 500، 409 برمی‌گرداند", async () => {
    prismaMock.customer.update.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" })
    );
    const res = await patchCustomer({ type: "OWNER" });
    expect(res.status).toBe(409);
  });
});
