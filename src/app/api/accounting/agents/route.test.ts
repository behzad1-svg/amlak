// Office row in the agents report + server-side scoping.
//
// The agents endpoint is OWNER-only: an AGENT gets 403 (no office row, no
// other advisors' rows — the agent's own-row view lives in /reports).
// The office row is computed with the same resolveSplit as every other
// report path; its "paid" part is the office share of deals marked
// commissionPaid (received), the rest is unpaid.
import { describe, it, expect, vi, beforeEach } from "vitest";
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
  user: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
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

// Hand-computed fixture (all COMPLETED):
// D1: owner, commission 100M, officePct 50, no shares, unpaid, sale 10bn
//     base 100M -> office 50M, virtual owner share 50M (unpaid)
// D2: agentA, commission 50M + seller shirini 10M, officePct 60,
//     agentB 40% settled, paid, sale 5bn
//     base 60M -> office 36M, agentB 24M settled
// D3: agentA, commission 20M - discount 20M = base 0 -> excluded everywhere
// D4: agentB, commission 30M, officePct 100, no shares, paid, sale 3bn
//     base 30M -> office 30M, no advisor share
// Office row: deals 3, withCommission 3, volume 18bn,
//   total 50+36+30 = 116M, paid 36+30 = 66M, unpaid 50M.
function fixtureDeals() {
  return [
    {
      agentId: OWNER.id,
      status: "COMPLETED",
      commissionToman: BigInt(100_000_000),
      sellerShiriniToman: null,
      buyerShiriniToman: null,
      discountToman: null,
      commissionPaid: false,
      dealSalePriceToman: BigInt(10_000_000_000),
      officePct: 50,
      agent: { id: OWNER.id, name: OWNER.name },
      shares: [],
    },
    {
      agentId: AGENT_A.id,
      status: "COMPLETED",
      commissionToman: BigInt(50_000_000),
      sellerShiriniToman: BigInt(10_000_000),
      buyerShiriniToman: null,
      discountToman: null,
      commissionPaid: true,
      dealSalePriceToman: BigInt(5_000_000_000),
      officePct: 60,
      agent: { id: AGENT_A.id, name: AGENT_A.name },
      shares: [
        { id: "s1", userId: AGENT_B.id, name: AGENT_B.name, pct: 40, settled: true, settledAt: null },
      ],
    },
    {
      agentId: AGENT_A.id,
      status: "COMPLETED",
      commissionToman: BigInt(20_000_000),
      sellerShiriniToman: null,
      buyerShiriniToman: null,
      discountToman: BigInt(20_000_000),
      commissionPaid: false,
      dealSalePriceToman: BigInt(2_000_000_000),
      officePct: 50,
      agent: { id: AGENT_A.id, name: AGENT_A.name },
      shares: [],
    },
    {
      agentId: AGENT_B.id,
      status: "COMPLETED",
      commissionToman: BigInt(30_000_000),
      sellerShiriniToman: null,
      buyerShiriniToman: null,
      discountToman: null,
      commissionPaid: true,
      dealSalePriceToman: BigInt(3_000_000_000),
      officePct: 100,
      agent: { id: AGENT_B.id, name: AGENT_B.name },
      shares: [],
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.user.findMany.mockResolvedValue([OWNER, AGENT_A, AGENT_B]);
  prismaMock.deal.findMany.mockResolvedValue(fixtureDeals());
});

describe("GET /api/accounting/agents — office row", () => {
  it("OWNER sees the office row with resolveSplit amounts", async () => {
    setSession(OWNER);
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    const office = json.users.find((r: any) => r.id === "office");
    expect(office).toBeDefined();
    expect(office.name).toBe("دفتر");
    expect(office.role).toBe("OFFICE");
    expect(office.dealsCompleted).toBe(3);
    expect(office.dealsWithCommission).toBe(3);
    expect(BigInt(office.saleVolume)).toBe(BigInt(18_000_000_000));
    expect(BigInt(office.commissionTotal)).toBe(BigInt(116_000_000));
    expect(BigInt(office.commissionPaid)).toBe(BigInt(66_000_000));
    expect(BigInt(office.commissionUnpaid)).toBe(BigInt(50_000_000));
    // The office row total is the same number as totals.officeTotal.
    expect(BigInt(json.totals.officeTotal)).toBe(BigInt(office.commissionTotal));
    expect(BigInt(json.totals.commissionGrandTotal)).toBe(BigInt(190_000_000));
    expect(BigInt(json.totals.externalTotal)).toBe(BigInt(0));
    expect(json.totals.dealsCompleted).toBe(4);
  });

  it("OWNER still sees correct advisor rows (incl. virtual share, office 100)", async () => {
    setSession(OWNER);
    const json = await (await GET()).json();
    const byId = new Map<string, any>(json.users.map((r: any) => [r.id, r]));
    const owner = byId.get(OWNER.id);
    expect(owner.dealsCompleted).toBe(1);
    expect(BigInt(owner.commissionTotal)).toBe(BigInt(50_000_000));
    expect(BigInt(owner.commissionUnpaid)).toBe(BigInt(50_000_000));
    const a = byId.get(AGENT_A.id);
    // D3 has a zero base (no money) but is still a completed deal he owns:
    // it counts in dealsCompleted / saleVolume / dealsWithCommission.
    expect(a.dealsCompleted).toBe(2);
    expect(a.dealsWithCommission).toBe(2);
    expect(BigInt(a.saleVolume)).toBe(BigInt(7_000_000_000));
    expect(BigInt(a.commissionTotal)).toBe(BigInt(0));
    const b = byId.get(AGENT_B.id);
    expect(b.dealsCompleted).toBe(2);
    expect(BigInt(b.commissionTotal)).toBe(BigInt(24_000_000));
    expect(BigInt(b.commissionPaid)).toBe(BigInt(24_000_000));
    // Totals stay the advisor-rows sum; the office row is not double-counted.
    expect(BigInt(json.totals.commissionTotal)).toBe(BigInt(74_000_000));
    expect(BigInt(json.totals.commissionPaid)).toBe(BigInt(24_000_000));
    expect(BigInt(json.totals.commissionUnpaid)).toBe(BigInt(50_000_000));
    // Office row comes last, after the advisor rows.
    expect(json.users[json.users.length - 1].id).toBe("office");
  });

  it("office row is present (all zeros) when there are no completed deals", async () => {
    setSession(OWNER);
    prismaMock.deal.findMany.mockResolvedValue([]);
    const json = await (await GET()).json();
    const office = json.users.find((r: any) => r.id === "office");
    expect(office).toBeDefined();
    expect(BigInt(office.commissionTotal)).toBe(BigInt(0));
    expect(office.dealsCompleted).toBe(0);
    expect(BigInt(json.totals.officeTotal)).toBe(BigInt(0));
  });

  it("AGENT gets 403 — no office row, no other advisors' rows leak", async () => {
    setSession(AGENT_A);
    const res = await GET();
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.users).toBeUndefined();
    expect(json.totals).toBeUndefined();
    expect(JSON.stringify(json)).not.toContain("دفتر");
    expect(JSON.stringify(json)).not.toContain("116000000");
  });

  it("no session gets 401", async () => {
    setSession(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
