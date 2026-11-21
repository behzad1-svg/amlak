// IDOR fix 2026-11-21: advertise on another advisor's file must be 403 —
// only the lister, OWNER, or a ticked advisor (active PropertyAccess grant) may
// mark a file as advertised (Behzad's rule 1405/08/30: tick = full view + advertise).
// A TEAM_VISIBLE viewer without a tick, or with a revoked/expired grant, gets 403.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

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
  property: { findUnique: vi.fn(), update: vi.fn() },
  propertyAccess: { findFirst: vi.fn() },
  activity: { findFirst: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  notification: { create: vi.fn(), createMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn(async () => undefined) }));

const OWNER = { id: "u-owner", name: "مدیر ساج", role: "OWNER" };
const AGENT_A = { id: "u-a", name: "دانیال عباسی", role: "AGENT" }; // lister
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
    title: "ویلای تست",
    listedById: AGENT_A.id,
    visibility: "TEAM_VISIBLE",
    isOfficeFile: false,
    deletedAt: null,
    isAdvertised: false,
  };
}

function postReq() {
  return new NextRequest("http://localhost/api/properties/p1/advertise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

const params = { params: Promise.resolve({ id: "p1" }) };

describe("POST /api/properties/[id]/advertise — lister, OWNER, or ticked advisor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.activity.findFirst.mockResolvedValue(null);
    prismaMock.propertyAccess.findFirst.mockResolvedValue(null);
    prismaMock.property.update.mockResolvedValue({ ...teamVisibleFile(), isAdvertised: true });
    prismaMock.activity.create.mockResolvedValue({ id: "act1" });
    prismaMock.user.findUnique.mockResolvedValue({ name: AGENT_A.name });
    prismaMock.user.findMany.mockResolvedValue([]);
    prismaMock.notification.create.mockResolvedValue({ id: "n1" });
    prismaMock.notification.createMany.mockResolvedValue({ count: 0 });
  });

  it("403 for an AGENT who is not the lister, even on a TEAM_VISIBLE file", async () => {
    setSession(AGENT_B);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(prismaMock.property.update).not.toHaveBeenCalled();
    expect(prismaMock.activity.create).not.toHaveBeenCalled();
  });

  it("200 for a ticked advisor (active PropertyAccess grant) and the registrar is notified", async () => {
    setSession(AGENT_B);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    prismaMock.propertyAccess.findFirst.mockResolvedValue({ id: "acc1" });
    prismaMock.user.findMany.mockResolvedValue([{ id: OWNER.id }]);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
    expect(prismaMock.property.update).toHaveBeenCalled();
    expect(prismaMock.activity.create).toHaveBeenCalled();
    // اعلان برای ثبت‌کننده فایل — تا بداند مشاور تیک‌خورده فایلش را آگهی کرد
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: AGENT_A.id, type: "ADVERTISED", relatedId: "p1" }),
      })
    );
    // اعلان مدیرها سر جایش است
    expect(prismaMock.notification.createMany).toHaveBeenCalled();
  });

  it("403 for a revoked grant — only active (unrevoked) grants count", async () => {
    setSession(AGENT_B);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    prismaMock.propertyAccess.findFirst.mockResolvedValue(null);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(prismaMock.property.update).not.toHaveBeenCalled();
    // مسیر فقط دسترسی فعال را می‌پرسد: باطل‌شده‌ها و منقضی‌شده‌ها در where فیلتر می‌شوند
    expect(prismaMock.propertyAccess.findFirst).toHaveBeenCalledWith({
      where: {
        propertyId: "p1",
        userId: AGENT_B.id,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
      },
    });
  });

  it("403 for an expired grant — an expired row must not unlock advertise", async () => {
    setSession(AGENT_B);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    prismaMock.propertyAccess.findFirst.mockResolvedValue(null);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(prismaMock.property.update).not.toHaveBeenCalled();
    expect(prismaMock.propertyAccess.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ revokedAt: null }),
    });
  });

  it("no registrar notification when the lister advertises their own file", async () => {
    setSession(AGENT_A);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it("200 for the listing AGENT", async () => {
    setSession(AGENT_A);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
    expect(prismaMock.property.update).toHaveBeenCalled();
  });

  it("200 for OWNER", async () => {
    setSession(OWNER);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
  });

  it("401 without a session", async () => {
    setSession(null);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(401);
  });
});
