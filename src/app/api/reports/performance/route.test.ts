// گزارش عملکرد — ستون «آگهی» فقط عدد نیست: advertisedItems باید بگوید
// کدوم فایل آگهی شده (کد + عنوان + تاریخ)، و مشاور فقط فایل‌های خودش را
// ببیند — نه فایل‌های مشاور دیگر را (Behzad, 1405/09/03).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
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
  user: { findMany: vi.fn(), findUnique: vi.fn() },
  property: { groupBy: vi.fn(), findMany: vi.fn() },
  activity: { groupBy: vi.fn(), findMany: vi.fn() },
  customer: { groupBy: vi.fn() },
  viewing: { groupBy: vi.fn() },
  deal: { findMany: vi.fn() },
  dealShare: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const AGENT_A = { id: "u-a", name: "دانیال عباسی", role: "AGENT" };
const AGENT_B = { id: "u-b", name: "فاطمه فخری", role: "AGENT" };

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function getReq() {
  return new NextRequest("http://localhost/api/reports/performance?range=30");
}

describe("GET /api/reports/performance — advertisedItems (کدوم فایل آگهی شد)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([
      { id: OWNER.id, name: OWNER.name, role: "OWNER" },
      { id: AGENT_A.id, name: AGENT_A.name, role: "AGENT" },
      { id: AGENT_B.id, name: AGENT_B.name, role: "AGENT" },
    ]);
    prismaMock.user.findUnique.mockResolvedValue({ ...AGENT_A, active: true });
    prismaMock.property.groupBy.mockResolvedValue([]);
    prismaMock.activity.groupBy.mockImplementation(async ({ where }: { where?: { type?: string } }) =>
      where?.type === "ADVERTISED"
        ? [
            { agentId: AGENT_A.id, _count: 2 },
            { agentId: AGENT_B.id, _count: 1 },
          ]
        : []
    );
    prismaMock.activity.findMany.mockResolvedValue([
      { agentId: AGENT_A.id, propertyId: "p1", createdAt: new Date(Date.now() - 1000) },
      { agentId: AGENT_A.id, propertyId: "p2", createdAt: new Date(Date.now() - 2000) },
      { agentId: AGENT_B.id, propertyId: "p3", createdAt: new Date(Date.now() - 3000) },
    ]);
    prismaMock.property.findMany.mockResolvedValue([
      { id: "p1", code: "F-0026", title: "آپارتمان تست" },
      { id: "p2", code: "F-0027", title: "ویلای تست" },
      { id: "p3", code: "F-0028", title: "واحد تست" },
    ]);
    prismaMock.customer.groupBy.mockResolvedValue([]);
    prismaMock.viewing.groupBy.mockResolvedValue([]);
    prismaMock.deal.findMany.mockResolvedValue([]);
    prismaMock.dealShare.findMany.mockResolvedValue([]);
  });

  it("OWNER sees every advisor's advertised files with code and title", async () => {
    setSession(OWNER);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { id: string; advertised: number }[];
      totals: { advertised: number };
      advertisedItems: { agentId: string; propertyId: string; code: string | null; title: string | null; date: string }[];
    };
    expect(body.users).toHaveLength(3);
    expect(body.totals.advertised).toBe(3);
    expect(body.advertisedItems).toHaveLength(3);
    const p1 = body.advertisedItems.find((it) => it.propertyId === "p1");
    expect(p1).toMatchObject({ agentId: AGENT_A.id, code: "F-0026", title: "آپارتمان تست" });
    expect(typeof p1?.date).toBe("string");
    const p3 = body.advertisedItems.find((it) => it.propertyId === "p3");
    expect(p3).toMatchObject({ agentId: AGENT_B.id, code: "F-0028" });
  });

  it("AGENT sees only their own advertised files — never another advisor's", async () => {
    setSession(AGENT_A);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      users: { id: string }[];
      totals: { advertised: number };
      advertisedItems: { agentId: string; propertyId: string }[];
    };
    expect(body.users).toHaveLength(1);
    expect(body.users[0]?.id).toBe(AGENT_A.id);
    expect(body.totals.advertised).toBe(2);
    expect(body.advertisedItems).toHaveLength(2);
    expect(body.advertisedItems.every((it) => it.agentId === AGENT_A.id)).toBe(true);
    expect(body.advertisedItems.some((it) => it.agentId === AGENT_B.id)).toBe(false);
  });

  it("a file that no longer resolves is still listed, with null code/title", async () => {
    setSession(OWNER);
    prismaMock.property.findMany.mockResolvedValue([]);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      advertisedItems: { propertyId: string; code: string | null; title: string | null }[];
    };
    expect(body.advertisedItems).toHaveLength(3);
    expect(body.advertisedItems.every((it) => it.code === null && it.title === null)).toBe(true);
  });

  it("401 without a session", async () => {
    setSession(null);
    const res = await GET(getReq());
    expect(res.status).toBe(401);
  });
});
