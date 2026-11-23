// اعتبارسنجی پایان بعد از شروع در PATCH بازدید — مثل POST (ممیزی ۲.۴).
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
  viewing: { findUnique: vi.fn(), update: vi.fn() },
  activity: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function existingViewing() {
  return {
    id: "v1",
    agentId: OWNER.id,
    customerId: "c1",
    propertyId: "p1",
    status: "SCHEDULED",
    startAt: new Date("2026-11-22T10:00:00.000Z"),
    endAt: new Date("2026-11-22T11:00:00.000Z"),
    rating: null,
  };
}

function patchViewing(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest("http://localhost/api/viewings/v1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "v1" }) }
  );
}

describe("PATCH /api/viewings/[id] — پایان باید بعد از شروع باشد", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(OWNER);
    prismaMock.viewing.findUnique.mockResolvedValue(existingViewing());
    prismaMock.viewing.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...existingViewing(),
      ...data,
    }));
  });

  it("پایانِ قبل از شروعِ ذخیره‌شده 400 می‌دهد", async () => {
    const res = await patchViewing({ endAt: "2026-11-22T09:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(prismaMock.viewing.update).not.toHaveBeenCalled();
  });

  it("شروعِ بعد از پایانِ ذخیره‌شده 400 می‌دهد", async () => {
    const res = await patchViewing({ startAt: "2026-11-22T12:00:00.000Z" });
    expect(res.status).toBe(400);
    expect(prismaMock.viewing.update).not.toHaveBeenCalled();
  });

  it("جابه‌جایی هر دو زمان به بازه معتبر، موفق است", async () => {
    const res = await patchViewing({
      startAt: "2026-11-22T14:00:00.000Z",
      endAt: "2026-11-22T15:00:00.000Z",
    });
    expect(res.status).toBe(200);
    expect(prismaMock.viewing.update).toHaveBeenCalled();
  });

  it("ویرایش بدون دست‌زدن به زمان‌ها، چک زمان را رد نمی‌کند", async () => {
    const res = await patchViewing({ feedback: "یادداشت تازه" });
    expect(res.status).toBe(200);
    expect(prismaMock.viewing.update).toHaveBeenCalled();
  });
});
