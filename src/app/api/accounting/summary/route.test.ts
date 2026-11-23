// «بدهی به مشاوران» نباید سهم خارجی (تعاون) را شامل شود (ممیزی ۲.۵).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
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
  deal: { findMany: vi.fn() },
  cashboxEntry: { groupBy: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

describe("GET /api/accounting/summary — بدهی به مشاوران بدون تعاون", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(OWNER);
    prismaMock.cashboxEntry.groupBy.mockResolvedValue([]);
  });

  it("سهم خارجی تسویه‌نشده در debtToAgents جمع نمی‌شود", async () => {
    // معامله قطعی، کمیسیون ۱۰۰م، دفتر ۵۰٪، سهم مشاور ۴۰٪ تسویه‌نشده + تعاون ۱۰٪ تسویه‌نشده
    prismaMock.deal.findMany.mockResolvedValue([
      {
        commissionToman: BigInt(100_000_000),
        taxRatePct: 10,
        sellerShiriniToman: null,
        buyerShiriniToman: null,
        discountToman: null,
        commissionPaid: false,
        status: "COMPLETED",
        agentId: "u-a",
        officePct: 50,
        agent: { id: "u-a", name: "دانیال عباسی" },
        shares: [
          { id: "s1", userId: "u-a", name: "دانیال عباسی", pct: 40, settled: false, settledAt: null },
          { id: "s2", userId: null, name: "تعاون", pct: 10, settled: false, settledAt: null },
        ],
      },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.debtToAgents).toBe("40000000");
    expect(body.officeTotal).toBe("50000000");
    expect(body.commissionTotal).toBe("100000000");
  });
});
