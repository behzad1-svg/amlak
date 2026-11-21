// قانون بهزاد ۱۴۰۵/۰۸/۳۰ — GET فایل TEAM_VISIBLE دیگران:
// منطقه + قیمت برمی‌گردد؛ آدرس دقیق و مالک هرگز برنمی‌گردد.
// ثبت‌کننده و مدیر، فایل کامل را می‌بینند.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

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
  property: { findUnique: vi.fn() },
  propertyAccess: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const AGENT_A = { id: "u-a", name: "مدیر ساج", role: "AGENT" }; // lister
const AGENT_B = { id: "u-b", name: "فاطمه فخری", role: "AGENT" }; // other advisor

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function teamVisibleFile() {
  return {
    id: "p1",
    code: "F-0027",
    title: "ویلای تست متری تنگک",
    type: "VILLA",
    dealType: "SALE",
    salePriceToman: BigInt("4000000000"),
    depositToman: null,
    monthlyRentToman: null,
    status: "SOLD",
    region: "تنگک",
    address: "خیابان سردار ۱۴، پلاک ۳",
    description: "مالک عجله دارد",
    visibility: "TEAM_VISIBLE",
    isOfficeFile: false,
    listedById: AGENT_A.id,
    listedBy: { id: AGENT_A.id, name: "مدیر ساج" },
    ownerId: "c-owner",
    owner: { id: "c-owner", name: "مالک تست", phone: "09170000002" },
    appraisedBy: { id: "u-c", name: "فرنام پورآزاد" },
    appraisedAt: new Date("2026-11-16T00:00:00Z"),
    deletedAt: null,
    accessList: [{ userId: "u-b", user: { id: "u-b", name: "فاطمه فخری" } }],
  };
}

function getReq() {
  return new NextRequest("http://localhost/api/properties/p1");
}

const params = { params: Promise.resolve({ id: "p1" }) };

describe("GET /api/properties/[id] — نمای تیمی: منطقه + قیمت، بدون آدرس/مالک", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    prismaMock.propertyAccess.findFirst.mockResolvedValue(null);
  });

  it("مشاور دیگر: منطقه و قیمت هست، آدرس و مالک نیست", async () => {
    setSession(AGENT_B);
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.region).toBe("تنگک");
    expect(body.salePriceToman).toBe("4000000000");
    expect(body.title).toBe("ویلای تست متری تنگک");
    expect(body.address).toBeUndefined();
    expect(body.owner).toBeUndefined();
    expect(body.ownerId).toBeUndefined();
    expect(body.description).toBeUndefined();
    expect(body.accessList).toBeUndefined();
  });

  it("ثبت‌کننده: آدرس و مالک کامل برمی‌گردد", async () => {
    setSession(AGENT_A);
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address).toBe("خیابان سردار ۱۴، پلاک ۳");
    expect(body.owner.name).toBe("مالک تست");
    expect(body.region).toBe("تنگک");
  });

  it("مدیر: آدرس و مالک کامل برمی‌گردد", async () => {
    setSession(OWNER);
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address).toBe("خیابان سردار ۱۴، پلاک ۳");
    expect(body.owner.name).toBe("مالک تست");
  });

  it("مشاور دارای دسترسی صریح (تیک‌خورده): آدرس کامل برمی‌گردد", async () => {
    setSession(AGENT_B);
    prismaMock.propertyAccess.findFirst.mockResolvedValue({ id: "acc1" });
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.address).toBe("خیابان سردار ۱۴، پلاک ۳");
  });

  it("401 بدون نشست", async () => {
    setSession(null);
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
  });
});
