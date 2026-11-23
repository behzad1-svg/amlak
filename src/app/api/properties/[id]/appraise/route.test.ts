// IDOR fix 2026-11-21: appraise on another advisor's file must be 403 —
// only the lister or OWNER may appraise (same rule as PATCH on properties/[id]).
import { describe, it, expect, vi, beforeEach } from "vitest";
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

const prismaMock = vi.hoisted(() => ({
  property: { findUnique: vi.fn(), update: vi.fn() },
  activity: { create: vi.fn() },
  user: { findUnique: vi.fn() },
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
    deletedAt: null,
    isAppraised: false,
    appraisedById: null,
    appraisedAt: null,
  };
}

function postReq() {
  return new NextRequest("http://localhost/api/properties/p1/appraise", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

const params = { params: Promise.resolve({ id: "p1" }) };

describe("POST /api/properties/[id]/appraise — only lister or OWNER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.property.update.mockResolvedValue({
      ...teamVisibleFile(),
      isAppraised: true,
      appraisedById: AGENT_A.id,
      appraisedBy: { id: AGENT_A.id, name: AGENT_A.name },
      listedBy: { id: AGENT_A.id, name: AGENT_A.name },
    });
    prismaMock.activity.create.mockResolvedValue({ id: "act1" });
  });

  it("403 for an AGENT who is not the lister, even on a TEAM_VISIBLE file", async () => {
    setSession(AGENT_B);
    prismaMock.property.findUnique.mockResolvedValue(teamVisibleFile());
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(prismaMock.property.update).not.toHaveBeenCalled();
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
