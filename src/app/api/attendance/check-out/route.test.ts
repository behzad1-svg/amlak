// ثبت خروج — مهلت: صبح تا ۱۴:۰۰، عصر تا ۲۲:۰۰؛ پس از آن خروج بسته است و
// رکورد با همان ورودِ بدون خروج می‌ماند («مشاور خروج نزده»).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
vi.mock("@/lib/settings", () => ({
  getAttendanceSettings: async () => ({
    officeLat: 28.962342,
    officeLng: 50.83878,
    radiusM: 100,
    morningStart: "09:00",
    morningEnd: "13:00",
    eveningStart: "17:00",
    eveningEnd: "21:00",
    fridayOff: true,
  }),
}));

const prismaMock = vi.hoisted(() => ({
  attendance: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const AGENT = { id: "u-a", name: "دانیال عباسی", role: "AGENT" };

function setSession() {
  authSession.current = {
    user: { ...AGENT, active: true, tokenVersion: 1, permissions: {} },
    payload: { userId: AGENT.id, role: AGENT.role, tokenVersion: 1 },
  };
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/attendance/check-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/attendance/check-out — مهلت خروج", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setSession();
    prismaMock.attendance.findFirst.mockResolvedValue({
      id: "a1", userId: AGENT.id, session: "MORNING", checkInAt: new Date("2026-11-23T05:30:00Z"), checkOutAt: null,
    });
    prismaMock.attendance.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "a1", ...data,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("morning check-out at 14:01 Tehran is rejected and the record is untouched", async () => {
    vi.setSystemTime(new Date("2026-11-23T10:31:00Z")); // 14:01 تهران
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("مهلت");
    expect(body.error).toContain("14:00");
    expect(prismaMock.attendance.update).not.toHaveBeenCalled();
  });

  it("evening check-out at 22:01 Tehran is rejected", async () => {
    prismaMock.attendance.findFirst.mockResolvedValue({
      id: "a2", userId: AGENT.id, session: "EVENING", checkInAt: new Date("2026-11-23T13:30:00Z"), checkOutAt: null,
    });
    vi.setSystemTime(new Date("2026-11-23T18:31:00Z")); // 22:01 تهران
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("22:00");
    expect(prismaMock.attendance.update).not.toHaveBeenCalled();
  });

  it("morning check-out at 13:30 Tehran still works", async () => {
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z")); // 13:30 تهران
    const res = await POST(postReq({}));
    expect(res.status).toBe(200);
    expect(prismaMock.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "a1" } })
    );
  });

  it("without an open check-in the request is rejected", async () => {
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    prismaMock.attendance.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("ورودی ثبت نشده");
    expect(prismaMock.attendance.update).not.toHaveBeenCalled();
  });

  it("401 without a session", async () => {
    vi.setSystemTime(new Date("2026-11-23T10:00:00Z"));
    authSession.current = null;
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
  });
});
