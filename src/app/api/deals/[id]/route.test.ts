// گارد جزئیات معامله باید همان OR لیست را بپذیرد (ممیزی ۱.۱):
// مشاورِ مشتریِ منتقل‌شده و سهم‌دار هم معامله را در لیست می‌بینند،
// پس جزئیات (GET) و ویرایش (PATCH) نباید به آن‌ها 403 بدهد.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH } from "./route";

const authSession = vi.hoisted(() => ({
  current: null as { user: any; payload: any } | null,
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
  deal: { findUnique: vi.fn() },
  customer: { findUnique: vi.fn() },
  dealShare: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const AGENT_A = { id: "u-a", name: "دانیال عباسی", role: "AGENT" }; // ثبت‌کننده معامله
const AGENT_B = { id: "u-b", name: "فاطمه فخری", role: "AGENT" }; // مشاور تازه‌منتقل‌شده / سهم‌دار
const AGENT_C = { id: "u-c", name: "فرنام پورآزاد", role: "AGENT" }; // بی‌ربط

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function dealRow() {
  return {
    id: "d1",
    agentId: AGENT_A.id,
    customerId: "c1",
    propertyId: "p1",
    status: "PENDING",
    customer: { id: "c1", name: "مشتری تست", phone: "09170000001" },
    property: { id: "p1", title: "ویلای تست", dealType: "SALE", region: "تنگک" },
    agent: { id: AGENT_A.id, name: "دانیال عباسی" },
  };
}

describe("GET /api/deals/[id] — گارد دسترسی مثل لیست", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.deal.findUnique.mockResolvedValue(dealRow());
    prismaMock.customer.findUnique.mockResolvedValue({ assignedAgentId: "u-someone-else" });
    prismaMock.dealShare.findFirst.mockResolvedValue(null);
  });

  it("مشاورِ مشتریِ منتقل‌شده جزئیات را می‌بیند (۲۰۰)", async () => {
    setSession(AGENT_B);
    prismaMock.customer.findUnique.mockResolvedValue({ assignedAgentId: AGENT_B.id });
    const res = await GET(new NextRequest("http://localhost/api/deals/d1"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(200);
  });

  it("سهم‌دار جزئیات را می‌بیند (۲۰۰)", async () => {
    setSession(AGENT_B);
    prismaMock.dealShare.findFirst.mockResolvedValue({ id: "s1" });
    const res = await GET(new NextRequest("http://localhost/api/deals/d1"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(200);
  });

  it("مشاور بی‌ربط 403 می‌گیرد", async () => {
    setSession(AGENT_C);
    const res = await GET(new NextRequest("http://localhost/api/deals/d1"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(403);
  });

  it("مدیر و ثبت‌کننده بدون چک اضافه ۲۰۰ می‌گیرند", async () => {
    setSession(OWNER);
    const resOwner = await GET(new NextRequest("http://localhost/api/deals/d1"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(resOwner.status).toBe(200);
    setSession(AGENT_A);
    const resAgent = await GET(new NextRequest("http://localhost/api/deals/d1"), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(resAgent.status).toBe(200);
  });
});

describe("PATCH /api/deals/[id] — گارد دسترسی مثل لیست", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.deal.findUnique.mockResolvedValue({
      ...dealRow(),
      customer: { id: "c1", name: "مشتری تست", phone: "09170000001", assignedAgentId: "u-someone-else" },
      property: { id: "p1", title: "ویلای تست", dealType: "SALE", status: "ACTIVE" },
      shares: [],
    });
  });

  // بدنه نامعتبر: اگر گارد رد کند 403 می‌دهد، اگر عبور کند 400 می‌دهد —
  // پس 400 یعنی گارد سهم‌دار/منتقل‌شده را پذیرفته است.
  const badBody = { status: "BOGUS" };

  it("سهم‌دار از گارد PATCH عبور می‌کند (۴۰۰ اعتبارسنجی، نه ۴۰۳)", async () => {
    setSession(AGENT_B);
    prismaMock.deal.findUnique.mockResolvedValue({
      ...dealRow(),
      customer: { id: "c1", name: "مشتری تست", phone: "09170000001", assignedAgentId: "u-someone-else" },
      property: { id: "p1", title: "ویلای تست", dealType: "SALE", status: "ACTIVE" },
      shares: [{ id: "s1", userId: AGENT_B.id, settled: false }],
    });
    const res = await PATCH(
      new NextRequest("http://localhost/api/deals/d1", {
        method: "PATCH",
        body: JSON.stringify(badBody),
      }),
      { params: Promise.resolve({ id: "d1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("مشاورِ مشتریِ منتقل‌شده از گارد PATCH عبور می‌کند", async () => {
    setSession(AGENT_B);
    prismaMock.deal.findUnique.mockResolvedValue({
      ...dealRow(),
      customer: { id: "c1", name: "مشتری تست", phone: "09170000001", assignedAgentId: AGENT_B.id },
      property: { id: "p1", title: "ویلای تست", dealType: "SALE", status: "ACTIVE" },
      shares: [],
    });
    const res = await PATCH(
      new NextRequest("http://localhost/api/deals/d1", {
        method: "PATCH",
        body: JSON.stringify(badBody),
      }),
      { params: Promise.resolve({ id: "d1" }) }
    );
    expect(res.status).toBe(400);
  });

  it("مشاور بی‌ربط در PATCH هم 403 می‌گیرد", async () => {
    setSession(AGENT_C);
    const res = await PATCH(
      new NextRequest("http://localhost/api/deals/d1", {
        method: "PATCH",
        body: JSON.stringify(badBody),
      }),
      { params: Promise.resolve({ id: "d1" }) }
    );
    expect(res.status).toBe(403);
  });
});
