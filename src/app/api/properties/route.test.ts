// قانون بهزاد ۱۴۰۵/۰۸/۳۰ — لیست فایل‌ها برای مشاور:
// فایل TEAM_VISIBLE دیگران ماسک می‌شود: منطقه + قیمت هست، آدرس و مالک نیست.
// فایل خودش کامل برمی‌گردد؛ مدیر همه را کامل می‌بیند.
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
  property: { findMany: vi.fn(), count: vi.fn() },
  propertyAccess: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// تنظیمات: ۷ نوع پیش‌فرض + یک نوع تازه که مدیر اضافه کرده (ممیزی ۲.۲)
const settingsMock = vi.hoisted(() => ({
  types: [
    { value: "APARTMENT", label: "آپارتمان" },
    { value: "VILLA", label: "ویلایی" },
    { value: "KOLANGI", label: "کلنگی" },
    { value: "LAND", label: "زمین" },
    { value: "SHOP", label: "مغازه" },
    { value: "OFFICE", label: "اداری" },
    { value: "COMMERCIAL", label: "تجاری" },
    { value: "BAGH", label: "باغ" },
  ],
}));
vi.mock("@/lib/settings", () => ({
  getPropertyTypes: async () => settingsMock.types,
}));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const AGENT_A = { id: "u-a", name: "مدیر ساج", role: "AGENT" }; // lister of the team file
const AGENT_B = { id: "u-b", name: "فاطمه فخری", role: "AGENT" }; // viewer

function setSession(user: { id: string; name: string; role: string } | null) {
  authSession.current = user
    ? {
        user: { ...user, active: true, tokenVersion: 1, permissions: {} },
        payload: { userId: user.id, role: user.role, tokenVersion: 1 },
      }
    : null;
}

function ownFile() {
  return {
    id: "p-own",
    code: "F-0030",
    title: "آپارتمان سنگی",
    type: "APARTMENT",
    dealType: "SALE",
    salePriceToman: BigInt("10000000000"),
    status: "ACTIVE",
    region: "سنگی",
    address: "خیابان خودم ۱",
    description: "یادداشت خودم",
    visibility: "TEAM_VISIBLE",
    isOfficeFile: false,
    listedById: AGENT_B.id,
    listedBy: { id: AGENT_B.id, name: "فاطمه فخری" },
    ownerId: "c-own",
    owner: { id: "c-own", name: "مالک خودم" },
    appraisedBy: null,
  };
}

function teamFile() {
  return {
    id: "p1",
    code: "F-0027",
    title: "ویلای تست متری تنگک",
    type: "VILLA",
    dealType: "SALE",
    salePriceToman: BigInt("4000000000"),
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
  };
}

describe("GET /api/properties — ماسک لیست برای مشاور", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.propertyAccess.findMany.mockResolvedValue([]);
    prismaMock.property.findMany.mockResolvedValue([ownFile(), teamFile()]);
    prismaMock.property.count.mockResolvedValue(2);
  });

  it("فایل دیگران ماسک می‌شود؛ فایل خودش کامل می‌ماند", async () => {
    setSession(AGENT_B);
    const res = await GET(new NextRequest("http://localhost/api/properties"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(2);
    // فایل خودش
    expect(body[0].address).toBe("خیابان خودم ۱");
    expect(body[0].owner.name).toBe("مالک خودم");
    // فایل TEAM_VISIBLE دیگران: منطقه + قیمت، بدون آدرس/مالک
    expect(body[1].region).toBe("تنگک");
    expect(body[1].salePriceToman).toBe("4000000000");
    expect(body[1].title).toBe("ویلای تست متری تنگک");
    expect(body[1].address).toBeUndefined();
    expect(body[1].owner).toBeUndefined();
    expect(body[1].ownerId).toBeUndefined();
    expect(body[1].description).toBeUndefined();
  });

  it("مدیر همه فایل‌ها را کامل می‌بیند", async () => {
    setSession(OWNER);
    const res = await GET(new NextRequest("http://localhost/api/properties"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].address).toBe("خیابان خودم ۱");
    expect(body[1].address).toBe("خیابان سردار ۱۴، پلاک ۳");
    expect(body[1].owner.name).toBe("مالک تست");
  });

  it("401 بدون نشست", async () => {
    setSession(null);
    const res = await GET(new NextRequest("http://localhost/api/properties"));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/properties — فیلتر نوع از تنظیمات می‌آید (ممیزی ۲.۲)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.propertyAccess.findMany.mockResolvedValue([]);
    prismaMock.property.findMany.mockResolvedValue([]);
    prismaMock.property.count.mockResolvedValue(0);
  });

  it("نوع تازه‌ای که مدیر در تنظیمات اضافه کرده (باغ) ۴۰۰ نمی‌گیرد", async () => {
    setSession(OWNER);
    const res = await GET(new NextRequest("http://localhost/api/properties?type=BAGH"));
    expect(res.status).toBe(200);
    expect(prismaMock.property.findMany).toHaveBeenCalled();
  });

  it("نوع پیش‌فرض هنوز معتبر است", async () => {
    setSession(OWNER);
    const res = await GET(new NextRequest("http://localhost/api/properties?type=APARTMENT"));
    expect(res.status).toBe(200);
  });

  it("نوع ناشناخته هنوز 400 می‌گیرد", async () => {
    setSession(OWNER);
    const res = await GET(new NextRequest("http://localhost/api/properties?type=NOPE"));
    expect(res.status).toBe(400);
  });
});
