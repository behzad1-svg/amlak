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
  customer: { groupBy: vi.fn(), findMany: vi.fn() },
  viewing: { groupBy: vi.fn(), findMany: vi.fn() },
  sessionCard: { findMany: vi.fn() },
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
    prismaMock.customer.findMany.mockResolvedValue([]);
    prismaMock.viewing.groupBy.mockResolvedValue([]);
    prismaMock.viewing.findMany.mockResolvedValue([]);
    prismaMock.sessionCard.findMany.mockResolvedValue([]);
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

type DetailItem = { agentId: string; id: string; code: string | null; title: string | null; date: string; href: string };
type DetailBody = {
  users: { id: string }[];
  fileItems: DetailItem[];
  appraisalItems: DetailItem[];
  sessionCardItems: DetailItem[];
  fileFindingItems: DetailItem[];
  viewingItems: DetailItem[];
  dealItems: DetailItem[];
  overdueItems: DetailItem[];
};

describe("GET /api/reports/performance — detail lists for every column", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.findMany.mockResolvedValue([
      { id: OWNER.id, name: OWNER.name, role: "OWNER" },
      { id: AGENT_A.id, name: AGENT_A.name, role: "AGENT" },
      { id: AGENT_B.id, name: AGENT_B.name, role: "AGENT" },
    ]);
    prismaMock.user.findUnique.mockResolvedValue({ ...AGENT_A, active: true });
    prismaMock.property.groupBy.mockResolvedValue([]);
    prismaMock.activity.groupBy.mockResolvedValue([]);
    prismaMock.activity.findMany.mockResolvedValue([]);
    // property.findMany به سه شکل صدا می‌شود: جزئیات فایل‌ها، جزئیات
    // کارشناسی‌ها، و lookup فایل‌های آگهی‌شده (where.id.in) — با where تفکیک می‌شود.
    prismaMock.property.findMany.mockImplementation(async (args: { where?: { id?: { in?: string[] }; isAppraised?: boolean } }) => {
      if (args?.where?.id?.in) {
        return [
          { id: "p1", code: "F-0026", title: "آپارتمان تست" },
          { id: "p2", code: "F-0027", title: "ویلای تست" },
          { id: "p3", code: "F-0028", title: "واحد تست" },
        ].filter((p) => args.where!.id!.in!.includes(p.id));
      }
      if (args?.where?.isAppraised) {
        return [
          { id: "p1", code: "F-0026", title: "آپارتمان تست", appraisedById: AGENT_A.id, appraisedAt: new Date("2026-11-20T10:00:00Z") },
          { id: "p3", code: "F-0028", title: "واحد تست", appraisedById: AGENT_B.id, appraisedAt: new Date("2026-11-21T10:00:00Z") },
        ];
      }
      return [
        { id: "p1", code: "F-0026", title: "آپارتمان تست", listedById: AGENT_A.id, createdAt: new Date("2026-11-20T10:00:00Z") },
        { id: "p2", code: "F-0027", title: "ویلای تست", listedById: AGENT_A.id, createdAt: new Date("2026-11-21T10:00:00Z") },
        { id: "p3", code: "F-0028", title: "واحد تست", listedById: AGENT_B.id, createdAt: new Date("2026-11-22T10:00:00Z") },
      ];
    });
    prismaMock.sessionCard.findMany.mockResolvedValue([
      { id: "sc1", advisorId: AGENT_A.id, createdAt: new Date("2026-11-20T11:00:00Z"), customer: { name: "مشتری یک" }, property: { code: "F-0026", title: "آپارتمان تست" } },
      { id: "sc2", advisorId: AGENT_B.id, createdAt: new Date("2026-11-21T11:00:00Z"), customer: { name: "مشتری دو" }, property: null },
    ]);
    // customer.findMany دوبار صدا می‌شود: فایل‌یابی (source) و عقب‌افتاده (nextFollowUpAt).
    prismaMock.customer.findMany.mockImplementation(async (args: { where?: { source?: string; nextFollowUpAt?: unknown } }) =>
      args?.where?.source === "FILE_FINDING"
        ? [
            { id: "c1", name: "مشتری فایل‌یابی الف", assignedAgentId: AGENT_A.id, createdAt: new Date("2026-11-20T09:00:00Z") },
            { id: "c2", name: "مشتری فایل‌یابی ب", assignedAgentId: AGENT_B.id, createdAt: new Date("2026-11-21T09:00:00Z") },
          ]
        : [
            { id: "c3", name: "مشتری عقب‌افتاده", assignedAgentId: AGENT_B.id, nextFollowUpAt: new Date("2026-11-22T08:30:00Z") },
          ]
    );
    prismaMock.viewing.findMany.mockResolvedValue([
      { id: "v1", agentId: AGENT_A.id, startAt: new Date("2026-11-20T14:00:00Z"), customer: { name: "مشتری بازدید" }, property: { code: "F-0027", title: "ویلای تست" } },
    ]);
    prismaMock.customer.groupBy.mockResolvedValue([]);
    prismaMock.viewing.groupBy.mockResolvedValue([]);
    prismaMock.deal.findMany.mockResolvedValue([
      { id: "d1", agentId: AGENT_A.id, contractAt: new Date("2026-11-20T12:00:00Z"), createdAt: new Date("2026-11-19T12:00:00Z"), customer: { name: "خریدار" }, property: { code: "F-0026", title: "آپارتمان تست" } },
    ]);
    // مشاور A هم مالک معامله است و هم در آن سهم دارد؛ مشاور B فقط سهم دارد.
    prismaMock.dealShare.findMany.mockResolvedValue([
      { userId: AGENT_A.id, dealId: "d1" },
      { userId: AGENT_B.id, dealId: "d1" },
    ]);
  });

  it("OWNER sees every advisor's items in all seven lists, with code/title/date/link", async () => {
    setSession(OWNER);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailBody;
    expect(body.fileItems).toHaveLength(3);
    expect(body.fileItems.find((it) => it.id === "p1")).toMatchObject({
      agentId: AGENT_A.id, code: "F-0026", title: "آپارتمان تست", href: "/properties/p1",
    });
    expect(typeof body.fileItems[0]?.date).toBe("string");
    expect(body.appraisalItems).toHaveLength(2);
    expect(body.appraisalItems.find((it) => it.agentId === AGENT_B.id)).toMatchObject({ code: "F-0028", href: "/properties/p3" });
    expect(body.sessionCardItems).toHaveLength(2);
    expect(body.sessionCardItems.find((it) => it.id === "sc1")).toMatchObject({
      agentId: AGENT_A.id, code: "F-0026", href: "/session-cards",
    });
    expect(body.sessionCardItems.find((it) => it.id === "sc1")?.title).toContain("مشتری یک");
    expect(body.sessionCardItems.find((it) => it.id === "sc2")).toMatchObject({ agentId: AGENT_B.id, code: null });
    expect(body.fileFindingItems).toHaveLength(2);
    expect(body.fileFindingItems.find((it) => it.id === "c1")).toMatchObject({
      agentId: AGENT_A.id, title: "مشتری فایل‌یابی الف", href: "/customers/c1",
    });
    expect(body.viewingItems).toHaveLength(1);
    expect(body.viewingItems[0]).toMatchObject({ agentId: AGENT_A.id, code: "F-0027", href: "/viewings" });
    expect(body.viewingItems[0]?.title).toContain("مشتری بازدید");
    // قرارداد: هر معامله برای هر نفر فقط یک بار — بااینکه A هم مالک است و هم سهم دارد.
    expect(body.dealItems.filter((it) => it.agentId === AGENT_A.id)).toHaveLength(1);
    expect(body.dealItems.filter((it) => it.agentId === AGENT_B.id)).toHaveLength(1);
    expect(body.dealItems[0]).toMatchObject({ id: "d1", code: "F-0026", href: "/deals" });
    expect(body.dealItems[0]?.title).toContain("خریدار");
    expect(body.overdueItems).toHaveLength(1);
    expect(body.overdueItems[0]).toMatchObject({
      agentId: AGENT_B.id, title: "مشتری عقب‌افتاده", href: "/customers/c3",
    });
    expect(typeof body.overdueItems[0]?.date).toBe("string");
  });

  it("AGENT sees only their own items in every list — never another advisor's", async () => {
    setSession(AGENT_A);
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as DetailBody;
    expect(body.users).toHaveLength(1);
    const lists: DetailItem[][] = [
      body.fileItems, body.appraisalItems, body.sessionCardItems,
      body.fileFindingItems, body.viewingItems, body.dealItems, body.overdueItems,
    ];
    for (const list of lists) {
      expect(list.every((it) => it.agentId === AGENT_A.id)).toBe(true);
      expect(list.some((it) => it.agentId === AGENT_B.id)).toBe(false);
    }
    expect(body.fileItems).toHaveLength(2);
    expect(body.dealItems).toHaveLength(1);
    expect(body.overdueItems).toHaveLength(0);
  });
});
