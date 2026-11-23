// Accounting stress harness — 500 scenarios against the LIVE database.
//
// Runs ONLY when ACCOUNTING_STRESS_LIVE=1 and DATABASE_URL points at
// saj_crm_db. Every fixture is marked "تست استرس 500" and deleted in
// afterAll; the run then verifies the live totals return to baseline.
// Set STRESS_SCENARIOS to run fewer randomized scenarios (smoke runs).
//
// IMPORTANT: never run this file against any other database. The guards
// below refuse to run unless the database name is saj_crm_db and the
// baseline snapshot matches the known live baseline.
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { GET as summaryGET } from "@/app/api/accounting/summary/route";
import { GET as agentsGET } from "@/app/api/accounting/agents/route";
import { GET as commissionsGET } from "@/app/api/accounting/commissions/route";
import { PATCH as commissionSettlePATCH } from "@/app/api/accounting/commissions/[id]/route";
import { PATCH as shareSettlePATCH } from "@/app/api/accounting/shares/[id]/route";
import { GET as cashboxGET, POST as cashboxPOST } from "@/app/api/accounting/cashbox/route";
import { POST as dealCreatePOST } from "@/app/api/deals/route";
import { PATCH as dealUpdatePATCH } from "@/app/api/deals/[id]/route";
import type { MockSession } from "@/lib/test-session";

const MARK = "تست استرس 500";
const ENABLED =
  process.env.ACCOUNTING_STRESS_LIVE === "1" &&
  (process.env.DATABASE_URL ?? "").includes("saj_crm_db");
const TOTAL_RANDOM = Number(process.env.STRESS_SCENARIOS ?? 481);
// 481 randomized + 19 counted edge scenarios = 500 total.
const BASELINE = {
  dealsCompleted: 5,
  commissionTotal: BigInt(350_000_000),
  // New split rule (Behzad 2026-11-20): share-less legacy deals F-0022/F-0023
  // pay their stored officePct=50 to the office — office 60.5M -> 180.5M,
  // advisor debt 290.5M -> 170.5M; the 351M total is unchanged.
  officeTotal: BigInt(180_500_000),
  debtToAgents: BigInt(170_500_000),
  shiriniTotal: BigInt(1_000_000),
  taxTotal: BigInt(35_000_000),
  cashboxBalance: BigInt(0),
};

const describeOrSkip = ENABLED ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Session mock: route handlers call getSessionFromCookies from "@/lib/auth".
// The harness signs in as real existing users (read-only) by swapping the
// mocked session; no password, token or User row is ever touched.
// ---------------------------------------------------------------------------
const authSession = vi.hoisted(() => ({
  current: null as MockSession | null,
}));
vi.mock("@/lib/auth", () => ({
  getSessionFromCookies: async () => authSession.current,
  validateSession: async () => authSession.current,
  setAuthCookie: async () => {},
  clearAuthCookie: async () => {},
  hashPassword: async () => {
    throw new Error("hashPassword is not mocked in the stress harness");
  },
  verifyPassword: async () => false,
  signToken: async () => {
    throw new Error("signToken is not mocked in the stress harness");
  },
  verifyToken: async () => null,
  invalidateUserTokens: async () => {},
  COOKIE_NAME_EXPORT: "saj_token",
}));

function setSession(user: { id: string; name: string; role: string }) {
  authSession.current = {
    user: { id: user.id, name: user.name, role: user.role, active: true, tokenVersion: 1, permissions: {} },
    payload: { userId: user.id, role: user.role, tokenVersion: 1 },
  };
}

// ---------------------------------------------------------------------------
// Independent money math (written from the documented rules, NOT by calling
// the lib under test — the point is to catch the lib disagreeing with them).
// ---------------------------------------------------------------------------
function bpsOf(pct: number): bigint {
  return BigInt(Math.round(pct * 100));
}
/** half-up rounding of base * pct / 100, in BigInt. */
function roundShare(base: bigint, pct: number): bigint {
  return (base * bpsOf(pct) + BigInt(5000)) / BigInt(10000);
}
function taxOf(commission: bigint, ratePct: number): bigint {
  return (commission * bpsOf(ratePct) + BigInt(5000)) / BigInt(10000);
}
// mulberry32 — deterministic so a failure can be replayed from the seed.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261120);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
function randBig(min: number, max: number): bigint {
  return BigInt(randInt(min, max));
}

// ---------------------------------------------------------------------------
// Route-call helpers. Responses serialize BigInt as strings.
// ---------------------------------------------------------------------------
// شکل‌های پاسخ API که هارنس می‌خواند — مبالغ BigInt به‌صورت رشته سریالایز می‌شوند.
type Money = string | number;
type SummaryJson = { [K in keyof SummaryMirror]: Money };
type AgentSummaryJson = {
  commissionTotal: Money;
  commissionPaid: Money;
  commissionUnpaid: Money;
  unpaidCount: number;
  dealsCompleted: number;
  dealsWithCommission: number;
  officeTotal: null;
  taxTotal: null;
  shiriniTotal: null;
  cashboxBalance: null;
};
type AgentsRow = {
  id: string;
  name: string;
  dealsCompleted: number;
  dealsWithCommission: number;
  saleVolume: Money;
  commissionTotal: Money;
  commissionPaid: Money;
  commissionUnpaid: Money;
};
type AgentsTotals = {
  dealsCompleted: number;
  officeTotal: Money;
  externalTotal: Money;
  commissionGrandTotal: Money;
  commissionTotal: Money;
  commissionPaid: Money;
  commissionUnpaid: Money;
};
type AgentsJson = { users: AgentsRow[]; totals: AgentsTotals };
type CashboxJson = { balance: Money; entries: unknown[] };
type DealJson = { id: string };
type CommissionListItem = { id: string; officeAmount?: Money; shares: unknown[] };

type CallResult<T = unknown> = { status: number; json: T };
async function callGET<T = unknown>(handler: (req: NextRequest) => Promise<Response>, url: string): Promise<CallResult<T>> {
  const res = await handler(new NextRequest(url));
  return { status: res.status, json: (await res.json()) as T };
}
async function callPATCH<T = unknown>(
  handler: (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>,
  url: string,
  id: string,
  body: Record<string, unknown>,
): Promise<CallResult<T>> {
  const res = await handler(
    new NextRequest(url, { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: (await res.json()) as T };
}
async function callPOST<T = unknown>(
  handler: (req: NextRequest) => Promise<Response>,
  url: string,
  body: Record<string, unknown>,
): Promise<CallResult<T>> {
  const res = await handler(
    new NextRequest(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  );
  return { status: res.status, json: (await res.json()) as T };
}
const BASE_URL = "http://localhost";

// Failures are collected with full context instead of aborting the run.
type Failure = { scenario: string; step: string; detail: string };
const failures: Failure[] = [];
function check(scenario: string, step: string, cond: boolean, detail: string) {
  if (!cond) failures.push({ scenario, step, detail });
  return cond;
}

function expectStatus(scenario: string, step: string, r: CallResult, want: number) {
  check(scenario, step, r.status === want, `expected HTTP ${want}, got ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`);
  return r.status === want;
}

// ---------------------------------------------------------------------------
// Fixtures + independent mirrors of the API semantics.
// ---------------------------------------------------------------------------
type TestUser = { id: string; name: string; role: string; active: boolean };
let ownerUser: TestUser;
let agentUsers: TestUser[] = [];
let inactiveUsers: TestUser[] = [];
const poolCustomers: { id: string; assignedAgentId: string }[] = [];
let currentRate = 10;

const testCustomerIds = new Set<string>();
const testPropertyIds = new Set<string>();
const testDealIds = new Set<string>();
const testShareIds = new Set<string>();
const testCashboxIds = new Set<string>();
let propCounter = 0;
let custCounter = 0;

type DbDeal = {
  id: string;
  status: string;
  agentId: string;
  commissionToman: bigint | null;
  commissionPercent: number | null;
  taxRatePct: number | null;
  sellerShiriniToman: bigint | null;
  buyerShiriniToman: bigint | null;
  discountToman: bigint | null;
  commissionPaid: boolean;
  officePct: Prisma.Decimal | null;
  dealSalePriceToman: bigint | null;
  shares: { id: string; userId: string | null; name: string; pct: Prisma.Decimal; settled: boolean }[];
};
const n0 = (v: bigint | null | undefined) => v ?? BigInt(0);
function dealBase(d: DbDeal): bigint {
  return n0(d.commissionToman) + n0(d.sellerShiriniToman) + n0(d.buyerShiriniToman) - n0(d.discountToman);
}
type SplitShare = { id: string | null; userId: string | null; name: string; pct: number; settled: boolean; isExternal: boolean; amount: bigint };
function mirrorSplit(d: DbDeal): { officePct: number; officeAmount: bigint; shares: SplitShare[] } {
  const base = dealBase(d);
  if (d.shares.length > 0) {
    const officePct = Number(d.officePct ?? 0);
    return {
      officePct,
      officeAmount: roundShare(base, officePct),
      shares: d.shares.map((s) => ({
        id: s.id,
        userId: s.userId,
        name: s.name,
        pct: Number(s.pct),
        settled: s.settled,
        isExternal: s.userId == null,
        amount: roundShare(base, Number(s.pct)),
      })),
    };
  }
  if (base <= BigInt(0)) return { officePct: 0, officeAmount: BigInt(0), shares: [] };
  // New rule (Behzad 2026-11-20): a share-less deal pays the stored officePct
  // to the office and the remainder to the deal agent as a virtual share.
  const officePct = Math.min(100, Math.max(0, Number(d.officePct ?? 0)));
  const agentPct = 100 - officePct;
  return {
    officePct,
    officeAmount: roundShare(base, officePct),
    shares:
      agentPct > 0
        ? [{ id: null, userId: d.agentId, name: "agent", pct: agentPct, settled: d.commissionPaid, isExternal: false, amount: roundShare(base, agentPct) }]
        : [],
  };
}

async function loadCompletedDeals(): Promise<DbDeal[]> {
  return (await prisma.deal.findMany({
    where: { status: "COMPLETED" },
    select: {
      id: true, status: true, agentId: true, commissionToman: true, commissionPercent: true,
      taxRatePct: true, sellerShiriniToman: true, buyerShiriniToman: true, discountToman: true,
      commissionPaid: true, officePct: true, dealSalePriceToman: true,
      shares: { select: { id: true, userId: true, name: true, pct: true, settled: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as unknown as DbDeal[];
}

type SummaryMirror = {
  commissionTotal: bigint; commissionPaid: bigint; commissionUnpaid: bigint;
  shiriniTotal: bigint; taxTotal: bigint; unpaidCount: number;
  dealsCompleted: number; dealsWithCommission: number;
  officeTotal: bigint; debtToAgents: bigint;
  cashboxBalance: bigint; cashboxIn: bigint; cashboxOut: bigint;
};
function mirrorSummaryOwner(deals: DbDeal[], entries: { type: string; amount: bigint }[]): SummaryMirror {
  const m: SummaryMirror = {
    commissionTotal: BigInt(0), commissionPaid: BigInt(0), commissionUnpaid: BigInt(0),
    shiriniTotal: BigInt(0), taxTotal: BigInt(0), unpaidCount: 0,
    dealsCompleted: 0, dealsWithCommission: 0,
    officeTotal: BigInt(0), debtToAgents: BigInt(0),
    cashboxBalance: BigInt(0), cashboxIn: BigInt(0), cashboxOut: BigInt(0),
  };
  for (const d of deals) {
    m.dealsCompleted += 1;
    if (d.commissionToman != null) m.dealsWithCommission += 1;
    m.shiriniTotal += n0(d.sellerShiriniToman) + n0(d.buyerShiriniToman);
    m.taxTotal += taxOf(n0(d.commissionToman), d.taxRatePct ?? currentRate);
    const base = dealBase(d);
    if (base <= BigInt(0)) continue;
    const split = mirrorSplit(d);
    m.commissionTotal += n0(d.commissionToman);
    if (d.commissionPaid) m.commissionPaid += n0(d.commissionToman);
    else {
      m.commissionUnpaid += n0(d.commissionToman);
      m.unpaidCount += 1;
    }
    m.officeTotal += split.officeAmount;
    for (const s of split.shares) if (!s.settled) m.debtToAgents += s.amount;
  }
  for (const e of entries) {
    if (e.type === "IN") m.cashboxIn += e.amount;
    else m.cashboxOut += e.amount;
  }
  m.cashboxBalance = m.cashboxIn - m.cashboxOut;
  return m;
}

async function verifyGlobal(tag: string) {
  const deals = await loadCompletedDeals();
  const entries = await prisma.cashboxEntry.findMany({ select: { id: true, type: true, amount: true, dealId: true, shareId: true } });
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, active: true } });

  // (a) amount residue: rounded parts must sum to the base within dust.
  for (const d of deals) {
    const base = dealBase(d);
    if (base <= BigInt(0)) continue;
    const split = mirrorSplit(d);
    const sum = split.officeAmount + split.shares.reduce((a, s) => a + s.amount, BigInt(0));
    const residue = sum >= base ? sum - base : base - sum;
    check(tag, "split-sums-to-base", residue <= BigInt(2), `deal ${d.id}: office+shares=${sum} base=${base} residue=${residue}`);
    const pctSum = split.officePct + split.shares.reduce((a, s) => a + s.pct, 0);
    check(tag, "pct-sums-to-100", Math.abs(pctSum - 100) < 0.011, `deal ${d.id}: pct sum=${pctSum}`);
  }
  // (d) cashbox uniqueness + canceled deals net zero.
  const pairCount = (keyFn: (e: (typeof entries)[number]) => string | null) => {
    const map = new Map<string, number>();
    for (const e of entries) {
      const k = keyFn(e);
      if (k) map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  };
  for (const [k, n] of pairCount((e) => (e.dealId && e.type === "IN" ? e.dealId : null)))
    check(tag, "cashbox-unique-in-per-deal", n <= 1, `deal ${k} has ${n} IN rows`);
  for (const [k, n] of pairCount((e) => (e.dealId && e.type === "OUT" ? e.dealId : null)))
    check(tag, "cashbox-unique-out-per-deal", n <= 1, `deal ${k} has ${n} OUT rows`);
  for (const [k, n] of pairCount((e) => (e.shareId && e.type === "OUT" ? e.shareId : null)))
    check(tag, "cashbox-unique-out-per-share", n <= 1, `share ${k} has ${n} OUT rows`);
  for (const [k, n] of pairCount((e) => (e.shareId && e.type === "IN" ? e.shareId : null)))
    check(tag, "cashbox-unique-in-per-share", n <= 1, `share ${k} has ${n} IN rows`);
  const canceled = await prisma.deal.findMany({
    where: { status: "CANCELED" },
    select: { id: true },
  });
  const canceledIds = new Set(canceled.map((c) => c.id));
  const canceledNet = new Map<string, bigint>();
  for (const e of entries) {
    if (!e.dealId || !canceledIds.has(e.dealId)) continue;
    canceledNet.set(e.dealId, (canceledNet.get(e.dealId) ?? BigInt(0)) + (e.type === "IN" ? e.amount : -e.amount));
  }
  for (const [id, net] of canceledNet)
    check(tag, "canceled-deal-cashbox-net-zero", net === BigInt(0), `canceled deal ${id} has cashbox net ${net}`);

  // Owner summary vs mirror.
  setSession(ownerUser);
  const s = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
  if (s.status === 200) {
    const m = mirrorSummaryOwner(deals, entries);
    const j = s.json;
    const eq = (name: string, got: unknown, want: bigint | number) =>
      check(tag, `summary-${name}`, BigInt(got as string | number | bigint) === BigInt(want), `summary.${name}: API=${got} mirror=${String(want)}`);
    eq("commissionTotal", j.commissionTotal, m.commissionTotal);
    eq("commissionPaid", j.commissionPaid, m.commissionPaid);
    eq("commissionUnpaid", j.commissionUnpaid, m.commissionUnpaid);
    eq("shiriniTotal", j.shiriniTotal, m.shiriniTotal);
    eq("taxTotal", j.taxTotal, m.taxTotal);
    eq("unpaidCount", j.unpaidCount, m.unpaidCount);
    eq("dealsCompleted", j.dealsCompleted, m.dealsCompleted);
    eq("dealsWithCommission", j.dealsWithCommission, m.dealsWithCommission);
    eq("officeTotal", j.officeTotal, m.officeTotal);
    eq("debtToAgents", j.debtToAgents, m.debtToAgents);
    eq("cashboxBalance", j.cashboxBalance, m.cashboxBalance);
    eq("cashboxIn", j.cashboxIn, m.cashboxIn);
    eq("cashboxOut", j.cashboxOut, m.cashboxOut);
  } else {
    check(tag, "summary-200", false, `summary GET returned ${s.status}`);
  }

  // Agents report vs mirror.
  const a = await callGET<AgentsJson>(agentsGET, `${BASE_URL}/api/accounting/agents`);
  if (a.status === 200) {
    const knownIds = new Set(users.filter((u) => u.active).map((u) => u.id));
    const extraIds = new Set<string>();
    for (const d of deals) {
      if (!knownIds.has(d.agentId)) extraIds.add(d.agentId);
      for (const sh of mirrorSplit(d).shares) if (sh.userId && !knownIds.has(sh.userId)) extraIds.add(sh.userId);
    }
    const allUsers = [...users.filter((u) => u.active), ...users.filter((u) => extraIds.has(u.id))];
    const rowsById = new Map<string, AgentsRow>(a.json.users.map((r) => [r.id, r]));
    let officeTotal = BigInt(0);
    let externalTotal = BigInt(0);
    let grandTotal = BigInt(0);
    for (const d of deals) {
      const base = dealBase(d);
      if (base <= BigInt(0)) continue;
      grandTotal += base;
      const split = mirrorSplit(d);
      officeTotal += split.officeAmount;
      for (const sh of split.shares) if (sh.isExternal) externalTotal += sh.amount;
    }
    for (const u of allUsers) {
      const row = rowsById.get(u.id);
      if (!row) {
        check(tag, "agents-row-present", false, `agents report has no row for ${u.name} (${u.id})`);
        continue;
      }
      let dc = 0, dwc = 0, vol = BigInt(0), ct = BigInt(0), cp = BigInt(0), cu = BigInt(0);
      for (const d of deals) {
        const split = mirrorSplit(d);
        if (d.agentId === u.id || split.shares.some((sh) => sh.userId === u.id)) dc += 1;
        if (d.agentId === u.id) {
          vol += n0(d.dealSalePriceToman);
          if (d.commissionToman != null) dwc += 1;
        }
        if (dealBase(d) > BigInt(0)) {
          for (const sh of split.shares) {
            if (sh.userId !== u.id) continue;
            ct += sh.amount;
            if (sh.settled) cp += sh.amount;
            else cu += sh.amount;
          }
        }
      }
      const eqB = (name: string, got: unknown, want: bigint | number) =>
        check(tag, `agents-${name}`, BigInt(got as string | number | bigint) === BigInt(want), `agents[${u.name}].${name}: API=${got} mirror=${String(want)}`);
      eqB("dealsCompleted", row.dealsCompleted, dc);
      eqB("dealsWithCommission", row.dealsWithCommission, dwc);
      eqB("saleVolume", row.saleVolume, vol);
      eqB("commissionTotal", row.commissionTotal, ct);
      eqB("commissionPaid", row.commissionPaid, cp);
      eqB("commissionUnpaid", row.commissionUnpaid, cu);
    }
    const t = a.json.totals;
    const eqT = (name: string, got: unknown, want: bigint | number) =>
      check(tag, `agents-totals-${name}`, BigInt(got as string | number | bigint) === BigInt(want), `agents.totals.${name}: API=${got} mirror=${String(want)}`);
    eqT("dealsCompleted", t.dealsCompleted, deals.length);
    eqT("officeTotal", t.officeTotal, officeTotal);
    eqT("externalTotal", t.externalTotal, externalTotal);
    eqT("commissionGrandTotal", t.commissionGrandTotal, grandTotal);
    // Grand totals now include the office row (advisors + office);
    // external co-op shares stay out.
    let advisorCt = BigInt(0), advisorCp = BigInt(0), advisorCu = BigInt(0);
    let officeCt = BigInt(0), officeCp = BigInt(0), officeCu = BigInt(0);
    for (const d of deals) {
      const base = dealBase(d);
      if (base <= BigInt(0)) continue;
      const split = mirrorSplit(d);
      officeCt += split.officeAmount;
      if (d.commissionPaid) officeCp += split.officeAmount;
      else officeCu += split.officeAmount;
      for (const sh of split.shares) {
        if (sh.isExternal || !sh.userId) continue;
        advisorCt += sh.amount;
        if (sh.settled) advisorCp += sh.amount;
        else advisorCu += sh.amount;
      }
    }
    eqT("commissionTotal", t.commissionTotal, advisorCt + officeCt);
    eqT("commissionPaid", t.commissionPaid, advisorCp + officeCp);
    eqT("commissionUnpaid", t.commissionUnpaid, advisorCu + officeCu);
  } else {
    check(tag, "agents-200", false, `agents GET returned ${a.status}`);
  }

  // Cashbox GET balance + receivables list.
  const c = await callGET<CashboxJson>(cashboxGET, `${BASE_URL}/api/accounting/cashbox`);
  if (c.status === 200) {
    const bal = entries.reduce((acc, e) => acc + (e.type === "IN" ? e.amount : -e.amount), BigInt(0));
    check(tag, "cashbox-balance", BigInt(c.json.balance) === bal, `cashbox balance API=${c.json.balance} mirror=${bal}`);
    check(tag, "cashbox-list-cap", c.json.entries.length === Math.min(entries.length, 200), `entries listed=${c.json.entries.length} total=${entries.length}`);
  } else {
    check(tag, "cashbox-200", false, `cashbox GET returned ${c.status}`);
  }
  const unpaid = await callGET<CommissionListItem[]>(commissionsGET, `${BASE_URL}/api/accounting/commissions?paid=unpaid`);
  if (unpaid.status === 200) {
    const want = await prisma.deal.findMany({
      where: { status: { not: "CANCELED" }, commissionPaid: false, OR: [
        { commissionToman: { not: null, gt: BigInt(0) } },
        { sellerShiriniToman: { not: null, gt: BigInt(0) } },
        { buyerShiriniToman: { not: null, gt: BigInt(0) } },
      ] },
      select: { id: true },
    });
    const gotIds: Set<string> = new Set((unpaid.json as { id: string }[]).map((d) => String(d.id)));
    const wantIds: Set<string> = new Set(want.map((d) => d.id));
    const missing: string[] = [...wantIds].filter((id) => !gotIds.has(id));
    const extra: string[] = [...gotIds].filter((id) => !wantIds.has(id));
    check(tag, "receivables-unpaid-set", missing.length === 0 && extra.length === 0, `unpaid mismatch: missing=${missing.slice(0, 5)} extra=${extra.slice(0, 5)}`);
  } else {
    check(tag, "commissions-unpaid-200", false, `commissions unpaid GET returned ${unpaid.status}`);
  }
}

async function verifyAgentSummary(tag: string, agent: TestUser) {
  setSession(agent);
  const s = await callGET<AgentSummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
  if (s.status !== 200) {
    check(tag, "agent-summary-200", false, `agent summary GET returned ${s.status}`);
    return;
  }
  const deals = (await loadCompletedDeals()).filter(
    (d) => d.agentId === agent.id || d.shares.some((sh) => sh.userId === agent.id),
  );
  let ct = BigInt(0), cp = BigInt(0), cu = BigInt(0), unpaid = 0, dwc = 0;
  for (const d of deals) {
    if (d.commissionToman != null) dwc += 1;
    const base = dealBase(d);
    if (base <= BigInt(0)) continue;
    const split = mirrorSplit(d);
    let ownUnpaid = false;
    for (const sh of split.shares) {
      if (sh.userId !== agent.id) continue;
      ct += sh.amount;
      if (sh.settled) cp += sh.amount;
      else {
        cu += sh.amount;
        ownUnpaid = true;
      }
    }
    if (ownUnpaid) unpaid += 1;
  }
  const j = s.json;
  const eq = (name: string, got: unknown, want: bigint | number) =>
    check(tag, `agent-summary-${name}`, BigInt(got as string | number | bigint) === BigInt(want), `agent summary.${name}: API=${got} mirror=${String(want)}`);
  eq("commissionTotal", j.commissionTotal, ct);
  eq("commissionPaid", j.commissionPaid, cp);
  eq("commissionUnpaid", j.commissionUnpaid, cu);
  eq("unpaidCount", j.unpaidCount, unpaid);
  eq("dealsCompleted", j.dealsCompleted, deals.length);
  eq("dealsWithCommission", j.dealsWithCommission, dwc);
  check(tag, "agent-summary-hides-office", j.officeTotal === null, `officeTotal visible to agent: ${j.officeTotal}`);
  check(tag, "agent-summary-hides-tax", j.taxTotal === null, `taxTotal visible to agent: ${j.taxTotal}`);
  check(tag, "agent-summary-hides-shirini", j.shiriniTotal === null, `shiriniTotal visible to agent: ${j.shiriniTotal}`);
  check(tag, "agent-summary-hides-cashbox", j.cashboxBalance === null, `cashboxBalance visible to agent: ${j.cashboxBalance}`);
}

// ---------------------------------------------------------------------------
// Fixtures, generation, flows.
// ---------------------------------------------------------------------------
async function makeProperty(dealType: "SALE" | "RENT", price: bigint, monthlyRent: bigint | null) {
  propCounter += 1;
  const owner = poolCustomers[propCounter % poolCustomers.length];
  const p = await prisma.property.create({
    data: {
      title: `${MARK} - ملک ${propCounter}`,
      type: "آپارتمان",
      dealType,
      region: "تنگک",
      ownerId: owner.id,
      listedById: ownerUser.id,
      salePriceToman: dealType === "SALE" ? price : null,
      depositToman: dealType === "RENT" ? price : null,
      monthlyRentToman: dealType === "RENT" ? monthlyRent : null,
      sizeSqm: 100,
      beds: 2,
    },
  });
  testPropertyIds.add(p.id);
  return p;
}

async function makeCustomer(assignedAgentId: string) {
  custCounter += 1;
  const c = await prisma.customer.create({
    data: {
      name: `${MARK} - مشتری ${custCounter}`,
      phone: `0900${String(1000000 + custCounter).padStart(7, "0")}`,
      type: "BUYER",
      stage: "NEW",
      assignedAgentId,
    },
  });
  testCustomerIds.add(c.id);
  return c;
}

type GenShare = { userId: string | null; name: string; pct: number };
type GenInput = {
  dealType: "SALE" | "RENT";
  price: bigint;
  monthlyRent: bigint;
  percent: number | null;
  commission: bigint | null;
  sellerShirini: bigint;
  buyerShirini: bigint;
  discount: bigint;
  officePct: number;
  shares: GenShare[];
  status: "PENDING" | "COMPLETED";
};

function splitPcts(remainder: number, count: number): number[] {
  if (count <= 0) return [];
  const weights = Array.from({ length: count }, () => 1 + rnd() * 9);
  const wSum = weights.reduce((a, b) => a + b, 0);
  const totalHundredths = Math.round(remainder * 100);
  const out: number[] = [];
  let used = 0;
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      out.push((totalHundredths - used) / 100);
    } else {
      const h = Math.max(1, Math.floor((totalHundredths * weights[i]) / wSum));
      const capped = Math.min(h, totalHundredths - used - (count - i - 1));
      out.push(capped / 100);
      used += capped;
    }
  }
  return out;
}

function genInput(): GenInput {
  const undetermined = rnd() < 0.05;
  const dealType: "SALE" | "RENT" = rnd() < 0.7 ? "SALE" : "RENT";
  const band =
    dealType === "SALE"
      ? pick([1_000_000, 100_000_000, 1_000_000_000, 5_000_000_000, 10_000_000_000, 30_000_000_000, 100_000_000_000])
      : pick([50_000_000, 200_000_000, 500_000_000, 1_000_000_000]);
  const price = BigInt(band) + randBig(0, 999_999);
  const monthlyRent = BigInt(randInt(5_000_000, 100_000_000));
  let percent: number | null = null;
  let commission: bigint | null = null;
  if (!undetermined) {
    if (dealType === "SALE") {
      percent = pick([0.25, 0.5, 1, 1.5, 2, 2.5, 5]);
      commission = roundShare(price, percent);
    } else {
      commission = pick([BigInt(0), BigInt(5_000_000), BigInt(20_000_000), BigInt(100_000_000), BigInt(123_456_789)]);
    }
  }
  const shiriniBase = commission ?? BigInt(0);
  const sellerShirini = undetermined || shiriniBase === BigInt(0) ? BigInt(0) : rnd() < 0.6 ? BigInt(0) : randBig(0, Number(shiriniBase / BigInt(20)));
  const buyerShirini = undetermined || shiriniBase === BigInt(0) ? BigInt(0) : rnd() < 0.6 ? BigInt(0) : randBig(0, Number(shiriniBase / BigInt(20)));
  const gross = (commission ?? BigInt(0)) + sellerShirini + buyerShirini;
  let discount = BigInt(0);
  if (gross > BigInt(0)) {
    const r = rnd();
    if (r < 0.1) discount = gross;
    else if (r < 0.3) discount = randBig(1, Number(gross / BigInt(10)) + 1);
  }
  const base = gross - discount;
  let officePct = 50;
  let shares: GenShare[] = [];
  if (base > BigInt(0)) {
    officePct = rnd() < 0.6 ? 50 : pick([0, 20, 40, 60, 80]);
    const k = pick([0, 1, 1, 2, 2, 3]);
    if (k > 0) {
      const pcts = splitPcts(100 - officePct, k);
      const agents = [...agentUsers].sort(() => rnd() - 0.5).slice(0, k);
      const useExternal = rnd() < 0.25;
      shares = pcts.map((pct, idx) => {
        if (useExternal && idx === 0) return { userId: null, name: "تعاون تست", pct };
        const a = agents[idx] ?? agents[0];
        return { userId: a.id, name: a.name, pct };
      });
      // de-duplicate agent ids (external slot aside)
      const seen = new Set<string>();
      shares = shares.filter((s) => {
        if (!s.userId) return true;
        if (seen.has(s.userId)) return false;
        seen.add(s.userId);
        return true;
      });
      if (shares.length === 0) officePct = 100;
      else {
        const fixed = splitPcts(100 - officePct, shares.length);
        shares = shares.map((s, idx) => ({ ...s, pct: fixed[idx] }));
      }
    } else {
      officePct = 100;
    }
  } else {
    officePct = 100;
    shares = [];
  }
  return {
    dealType, price, monthlyRent, percent, commission,
    sellerShirini, buyerShirini, discount, officePct, shares,
    status: rnd() < 0.8 ? "COMPLETED" : "PENDING",
  };
}

async function postDeal(tag: string, input: GenInput, customerId: string, propertyId: string) {
  setSession(ownerUser);
  const body: Record<string, unknown> = {
    customerId,
    propertyId,
    status: input.status,
    notes: `${MARK} - ${tag}`,
  };
  if (input.commission != null) body.commissionToman = String(input.commission);
  if (input.percent != null) body.commissionPercent = input.percent;
  if (input.dealType === "SALE") body.dealSalePriceToman = String(input.price);
  else {
    body.dealDepositToman = String(input.price);
    body.dealMonthlyRentToman = String(input.monthlyRent);
  }
  const r = await callPOST<DealJson>(dealCreatePOST, `${BASE_URL}/api/deals`, body);
  if (r.status === 201) testDealIds.add(r.json.id);
  return r;
}

async function patchDeal(tag: string, step: string, dealId: string, body: Record<string, unknown>, want = 200) {
  setSession(ownerUser);
  const r = await callPATCH(dealUpdatePATCH, `${BASE_URL}/api/deals/${dealId}`, dealId, body);
  expectStatus(tag, step, r, want);
  return r;
}

async function loadDealFull(dealId: string) {
  const d = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { shares: { orderBy: { createdAt: "asc" } } },
  });
  return d as unknown as DbDeal | null;
}

async function runScenario(i: number) {
  const tag = `scenario-${i}`;
  const input = genInput();
  const customer = poolCustomers[i % poolCustomers.length];
  const property = await makeProperty(input.dealType, input.price, input.monthlyRent);
  const created = await postDeal(tag, input, customer.id, property.id);
  if (!expectStatus(tag, "create-deal", created, 201)) {
    await prisma.property.delete({ where: { id: property.id } }).catch(() => {});
    testPropertyIds.delete(property.id);
    return;
  }
  const dealId = created.json.id as string;
  const base = (input.commission ?? BigInt(0)) + input.sellerShirini + input.buyerShirini - input.discount;

  // Split (PATCH also sets shirini/discount, which POST cannot carry).
  if (base > BigInt(0)) {
    const r = await patchDeal(tag, "set-split", dealId, {
      officePct: input.officePct,
      shares: input.shares,
      sellerShiriniToman: String(input.sellerShirini),
      buyerShiriniToman: String(input.buyerShirini),
      discountToman: String(input.discount),
    });
    if (r.status === 200) {
      const d = await loadDealFull(dealId);
      for (const s of d?.shares ?? []) testShareIds.add(s.id);
    }
  } else {
    if (rnd() < 0.5) {
      await patchDeal(tag, "set-split-zero-base", dealId, { officePct: 100, shares: [] });
    }
  }

  let status: "PENDING" | "COMPLETED" | "CANCELED" = input.status;
  let received = false;
  let settled = new Set<string>();
  let reversedReceipt = false;

  const reload = async () => (await loadDealFull(dealId))!;
  const refreshSettled = async () => {
    const d = await reload();
    settled = new Set(d.shares.filter((s) => s.settled).map((s) => s.id));
    for (const s of d.shares) testShareIds.add(s.id);
    return d;
  };

  if (status === "PENDING" && rnd() < 0.5) {
    const r = await patchDeal(tag, "complete", dealId, { status: "COMPLETED" });
    if (r.status === 200) status = "COMPLETED";
  }
  if (status !== "COMPLETED") {
    await verifyGlobal(tag);
    return;
  }

  if (base > BigInt(0) && rnd() < 0.6) {
    setSession(ownerUser);
    const r = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    if (expectStatus(tag, "receive", r, 200)) received = true;
  }
  const d0 = await refreshSettled();
  if (d0.shares.length > 0 && rnd() < 0.7) {
    const shuffled = [...d0.shares].sort(() => rnd() - 0.5);
    const subset = shuffled.slice(0, 1 + Math.floor(rnd() * shuffled.length));
    for (const s of subset) {
      setSession(ownerUser);
      const r = await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${s.id}`, s.id, { settled: true });
      if (expectStatus(tag, "settle-share", r, 200)) settled.add(s.id);
    }
  }
  if (settled.size > 0 && rnd() < 0.3) {
    const sid = [...settled][0];
    setSession(ownerUser);
    const r = await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${sid}`, sid, { settled: false });
    if (expectStatus(tag, "reverse-settle", r, 200)) {
      settled.delete(sid);
      if (rnd() < 0.5) {
        const r2 = await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${sid}`, sid, { settled: true });
        if (expectStatus(tag, "re-settle", r2, 200)) settled.add(sid);
      }
    }
  }
  if (received) {
    await refreshSettled();
    if (settled.size > 0) {
      if (rnd() < 0.15) {
        setSession(ownerUser);
        const r = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: false });
        expectStatus(tag, "reverse-receipt-blocked-when-settled", r, 400);
      }
    } else if (rnd() < 0.3) {
      setSession(ownerUser);
      const r = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: false });
      if (expectStatus(tag, "reverse-receipt", r, 200)) {
        received = false;
        reversedReceipt = true;
      }
    }
  }
  if (reversedReceipt && rnd() < 0.5) {
    setSession(ownerUser);
    const r = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    if (expectStatus(tag, "re-receive", r, 200)) received = true;
  }
  // Commission edit (only when nothing is settled/paid — otherwise the money lock applies).
  await refreshSettled();
  if (!received && settled.size === 0 && rnd() < 0.3) {
    if (input.dealType === "SALE" && input.percent != null && input.commission != null) {
      const newPercent = pick([0.5, 1, 2, 2.5]);
      const newAmount = roundShare(input.price, newPercent);
      const ok = await patchDeal(tag, "edit-commission-consistent", dealId, {
        commissionPercent: newPercent,
        commissionToman: String(newAmount),
      });
      if (ok.status === 200) {
        const bad = await patchDeal(tag, "edit-commission-inconsistent", dealId, {
          commissionPercent: newPercent,
          commissionToman: String(newAmount + BigInt(100_000)),
        }, 400);
        void bad;
      }
    } else if (input.dealType === "RENT") {
      await patchDeal(tag, "edit-commission-rent-manual", dealId, {
        commissionToman: String(randBig(1_000_000, 50_000_000)),
      });
    }
  }
  // Cancel: blocked when received/settled, allowed otherwise.
  {
    const d = await refreshSettled();
    const mustBlock = d.commissionPaid || d.shares.some((s) => s.settled);
    if (mustBlock) {
      await patchDeal(tag, "cancel-blocked", dealId, { status: "CANCELED" }, 400);
    } else if (rnd() < 0.5) {
      const r = await patchDeal(tag, "cancel", dealId, { status: "CANCELED" });
      if (r.status === 200) status = "CANCELED";
    }
  }
  if (i % 20 === 0 && agentUsers.length > 0) {
    await verifyAgentSummary(tag, agentUsers[i % agentUsers.length]);
  }
  await verifyGlobal(tag);
}

// ---------------------------------------------------------------------------
// Cleanup: delete every fixture by tracked id AND by marker (belt and braces).
// ---------------------------------------------------------------------------
async function cleanupMarkers() {
  const markedDeals = await prisma.deal.findMany({ where: { notes: { contains: MARK } }, select: { id: true } });
  const dealIds = [...testDealIds, ...markedDeals.map((d) => d.id)];
  await prisma.cashboxEntry.deleteMany({
    where: { OR: [{ dealId: { in: dealIds } }, { shareId: { in: [...testShareIds] } }, { title: { contains: MARK } }] },
  });
  await prisma.dealShare.deleteMany({ where: { dealId: { in: dealIds } } });
  await prisma.activity.deleteMany({
    where: { OR: [{ customerId: { in: [...testCustomerIds] } }, { propertyId: { in: [...testPropertyIds] } }] },
  });
  await prisma.deal.deleteMany({
    where: { OR: [{ id: { in: dealIds } }, { notes: { contains: MARK } }] },
  });
  // Properties reference customers (ownerId) — delete properties first.
  await prisma.property.deleteMany({
    where: { OR: [{ id: { in: [...testPropertyIds] } }, { title: { contains: MARK } }] },
  });
  await prisma.customer.deleteMany({
    where: { OR: [{ id: { in: [...testCustomerIds] } }, { name: { contains: MARK } }] },
  });
  testCustomerIds.clear();
  testPropertyIds.clear();
  testDealIds.clear();
  testShareIds.clear();
  testCashboxIds.clear();
}

async function countMarkers() {
  const [deals, customers, properties, entries] = await Promise.all([
    prisma.deal.count({ where: { notes: { contains: MARK } } }),
    prisma.customer.count({ where: { name: { contains: MARK } } }),
    prisma.property.count({ where: { title: { contains: MARK } } }),
    prisma.cashboxEntry.count({ where: { title: { contains: MARK } } }),
  ]);
  return { deals, customers, properties, entries };
}

let startNonTestCompleted = 0;
let startTime = 0;
let scenariosRun = 0;

describeOrSkip("accounting stress — 500 scenarios on the live database", () => {
  beforeAll(async () => {
    const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, active: true } });
    ownerUser = users.find((u) => u.role === "OWNER" && u.active) as TestUser;
    agentUsers = users.filter((u) => u.role === "AGENT" && u.active) as TestUser[];
    inactiveUsers = users.filter((u) => !u.active) as TestUser[];
    if (!ownerUser) throw new Error("no active OWNER user found (read-only lookup)");
    if (agentUsers.length < 2) throw new Error("need at least 2 active agents for the harness");
    const row = await prisma.appSetting.findUnique({ where: { key: "taxRate" } });
    if (row) {
      const n = Number(JSON.parse(row.value));
      if (Number.isFinite(n) && n >= 0 && n <= 100) currentRate = n;
    }
    await cleanupMarkers();
    for (let i = 0; i < 5; i++) {
      const agent = agentUsers[i % agentUsers.length] ?? ownerUser;
      const c = await makeCustomer(agent.id);
      poolCustomers.push({ id: c.id, assignedAgentId: agent.id });
    }
    startNonTestCompleted = await prisma.deal.count({ where: { status: "COMPLETED" } });
    setSession(ownerUser);
    const s = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    if (s.status !== 200) throw new Error(`baseline summary GET failed: ${s.status}`);
    const j = s.json;
    const mismatch: string[] = [];
    const cmp = (name: string, got: unknown, want: bigint | number) => {
      if (BigInt(got as string | number | bigint) !== BigInt(want)) mismatch.push(`${name}: got ${got}, want ${String(want)}`);
    };
    cmp("dealsCompleted", j.dealsCompleted, BASELINE.dealsCompleted);
    cmp("commissionTotal", j.commissionTotal, BASELINE.commissionTotal);
    cmp("officeTotal", j.officeTotal, BASELINE.officeTotal);
    cmp("debtToAgents", j.debtToAgents, BASELINE.debtToAgents);
    cmp("shiriniTotal", j.shiriniTotal, BASELINE.shiriniTotal);
    cmp("taxTotal", j.taxTotal, BASELINE.taxTotal);
    cmp("cashboxBalance", j.cashboxBalance, BASELINE.cashboxBalance);
    if (mismatch.length > 0) {
      throw new Error(`live baseline drifted — refusing to run 500 scenarios: ${mismatch.join("; ")}`);
    }
    startTime = Date.now();
  }, 120_000);

  afterAll(async () => {
    await cleanupMarkers();
    const left = await countMarkers();
    const totalLeft = left.deals + left.customers + left.properties + left.entries;
    if (totalLeft > 0) {
      failures.push({ scenario: "cleanup", step: "markers-remain", detail: JSON.stringify(left) });
    }
    const endNonTestCompleted = await prisma.deal.count({ where: { status: "COMPLETED" } });
    if (endNonTestCompleted !== startNonTestCompleted) {
      failures.push({
        scenario: "cleanup",
        step: "external-activity",
        detail: `non-test COMPLETED deals changed during the run: start=${startNonTestCompleted} end=${endNonTestCompleted} (someone used the live site mid-run, or cleanup missed a deal)`,
      });
    }
    setSession(ownerUser);
    const s = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    if (s.status === 200) {
      const j = s.json;
      const cmp = (name: string, got: unknown, want: bigint | number) => {
        if (BigInt(got as string | number | bigint) !== BigInt(want))
          failures.push({ scenario: "cleanup", step: `baseline-${name}`, detail: `got ${got}, want ${String(want)}` });
      };
      cmp("dealsCompleted", j.dealsCompleted, BASELINE.dealsCompleted);
      cmp("commissionTotal", j.commissionTotal, BASELINE.commissionTotal);
      cmp("officeTotal", j.officeTotal, BASELINE.officeTotal);
      cmp("debtToAgents", j.debtToAgents, BASELINE.debtToAgents);
      cmp("shiriniTotal", j.shiriniTotal, BASELINE.shiriniTotal);
      cmp("taxTotal", j.taxTotal, BASELINE.taxTotal);
      cmp("cashboxBalance", j.cashboxBalance, BASELINE.cashboxBalance);
    } else {
      failures.push({ scenario: "cleanup", step: "baseline-summary", detail: `summary GET returned ${s.status}` });
    }
    const secs = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[stress] scenarios=${scenariosRun} failures=${failures.length} elapsed=${secs}s`);
    for (const f of failures.slice(0, 50)) console.log(`[stress-fail] ${f.scenario} :: ${f.step} :: ${f.detail}`);
  }, 180_000);

  // --- deterministic edge cases (30 scenarios) ---
  it("edge: commission 0 with shirini only", async () => {
    const tag = "edge-commission-0";
    const customer = poolCustomers[0];
    const property = await makeProperty("SALE", BigInt(5_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(5_000_000_000), monthlyRent: BigInt(0),
      percent: 0, commission: BigInt(0), sellerShirini: BigInt(2_000_000), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }], sellerShiriniToman: "2000000", buyerShiriniToman: "0", discountToman: "0" });
    const d = await loadDealFull(dealId);
    check(tag, "base-is-shirini", dealBase(d!) === BigInt(2_000_000), `base=${dealBase(d!)}`);
    check(tag, "tax-is-zero", taxOf(n0(d!.commissionToman), currentRate) === BigInt(0), "tax on zero commission must be 0");
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: discount equals gross (base 0)", async () => {
    const tag = "edge-discount-eq-gross";
    const customer = poolCustomers[1];
    const property = await makeProperty("SALE", BigInt(4_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(4_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(40_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(40_000_000), officePct: 100, shares: [], status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split-zero-base", dealId, { officePct: 100, shares: [], discountToman: "40000000" });
    setSession(ownerUser);
    const recv = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    expectStatus(tag, "receive-base-0-blocked", recv, 400);
    const d = await loadDealFull(dealId);
    check(tag, "base-zero", dealBase(d!) === BigInt(0), `base=${dealBase(d!)}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: rounding half-up", async () => {
    const tag = "edge-rounding";
    const customer = poolCustomers[2];
    const property = await makeProperty("SALE", BigInt(1_000_100), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(1_000_100), monthlyRent: BigInt(0),
      percent: 0.5, commission: BigInt(5001), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 0,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 100 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create-5001", created, 201)) return;
    check(tag, "commission-5001", roundShare(BigInt(1_000_100), 0.5) === BigInt(5001), `roundShare=${roundShare(BigInt(1_000_100), 0.5)}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: split residue on odd base", async () => {
    const tag = "edge-split-residue";
    const customer = poolCustomers[0];
    const property = await makeProperty("SALE", BigInt(10_000_000_100), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(10_000_000_100), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(100_000_001), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 0,
      shares: [
        { userId: agentUsers[0].id, name: agentUsers[0].name, pct: 33.33 },
        { userId: agentUsers[1].id, name: agentUsers[1].name, pct: 33.33 },
        { userId: agentUsers[2].id, name: agentUsers[2].name, pct: 33.34 },
      ],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, {
      officePct: 0,
      shares: [
        { userId: agentUsers[0].id, pct: 33.33 },
        { userId: agentUsers[1].id, pct: 33.33 },
        { userId: agentUsers[2].id, pct: 33.34 },
      ],
    });
    const d = await loadDealFull(dealId);
    const amounts = d!.shares.map((s) => roundShare(BigInt(100_000_001), Number(s.pct)));
    const sum = amounts.reduce((a, b) => a + b, BigInt(0));
    check(tag, "residue-lte-2", sum >= BigInt(100_000_001) - BigInt(2) && sum <= BigInt(100_000_001) + BigInt(2), `shares sum=${sum} base=100000001`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: inactive advisor owns deal; inactive share rejected; agents report keeps them", async () => {
    const tag = "edge-inactive-advisor";
    if (inactiveUsers.length === 0) {
      check(tag, "inactive-user-exists", false, "no inactive user in the live DB to test with");
      return;
    }
    const inactive = inactiveUsers[0];
    const customer = await makeCustomer(inactive.id);
    const property = await makeProperty("SALE", BigInt(3_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(3_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(30_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    const d0 = await loadDealFull(dealId);
    check(tag, "deal-agent-is-inactive-user", d0!.agentId === inactive.id, `agentId=${d0!.agentId} inactive=${inactive.id}`);
    await patchDeal(tag, "split-with-inactive-share-rejected", dealId, {
      officePct: 50,
      shares: [{ userId: inactive.id, pct: 50 }],
    }, 400);
    await patchDeal(tag, "split-valid", dealId, {
      officePct: 50,
      shares: [{ userId: agentUsers[0].id, pct: 50 }],
    });
    setSession(ownerUser);
    const a = await callGET<AgentsJson>(agentsGET, `${BASE_URL}/api/accounting/agents`);
    const row = a.json.users.find((r) => r.id === inactive.id);
    check(tag, "agents-report-includes-inactive-owner", !!row, "inactive deal owner missing from agents report");
    if (row) check(tag, "inactive-row-deals", BigInt(row.dealsCompleted) === BigInt(1), `dealsCompleted=${row.dealsCompleted}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: external co-op share settles to cashbox", async () => {
    const tag = "edge-external-coop";
    const customer = poolCustomers[1];
    const property = await makeProperty("SALE", BigInt(6_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(6_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(60_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [
        { userId: agentUsers[0].id, name: agentUsers[0].name, pct: 25 },
        { userId: null, name: "تعاون تست", pct: 25 },
      ],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, {
      officePct: 50,
      shares: [
        { userId: agentUsers[0].id, pct: 25 },
        { userId: null, name: "تعاون تست", pct: 25 },
      ],
    });
    const d = await loadDealFull(dealId);
    const ext = d!.shares.find((s) => s.userId == null)!;
    setSession(ownerUser);
    const r = await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${ext.id}`, ext.id, { settled: true });
    expectStatus(tag, "settle-external", r, 200);
    const out = await prisma.cashboxEntry.findFirst({ where: { shareId: ext.id, type: "OUT" } });
    check(tag, "external-out-amount", !!out && out.amount === roundShare(BigInt(60_000_000), 25), `out=${out?.amount}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: agent changed after deal — attribution stays", async () => {
    const tag = "edge-agent-changed";
    const customer = poolCustomers[2];
    const property = await makeProperty("SALE", BigInt(2_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(2_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(20_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }] });
    const before = await loadDealFull(dealId);
    const newAgent = agentUsers.find((a) => a.id !== before!.agentId)!;
    await prisma.customer.update({ where: { id: customer.id }, data: { assignedAgentId: newAgent.id } });
    const after = await loadDealFull(dealId);
    check(tag, "deal-agent-unchanged", after!.agentId === before!.agentId, `before=${before!.agentId} after=${after!.agentId}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: cancel blocked when settled/paid, allowed after reversal", async () => {
    const tag = "edge-cancel-flow";
    const customer = poolCustomers[3];
    const property = await makeProperty("SALE", BigInt(8_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(8_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(80_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }] });
    setSession(ownerUser);
    await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    const d = await loadDealFull(dealId);
    const shareId = d!.shares[0].id;
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${shareId}`, shareId, { settled: true });
    await patchDeal(tag, "cancel-blocked-paid-settled", dealId, { status: "CANCELED" }, 400);
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${shareId}`, shareId, { settled: false });
    await patchDeal(tag, "cancel-blocked-paid-only", dealId, { status: "CANCELED" }, 400);
    const rr = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: false });
    expectStatus(tag, "reverse-receipt", rr, 200);
    const ok = await patchDeal(tag, "cancel-after-reversal", dealId, { status: "CANCELED" });
    check(tag, "cancel-after-reversal-200", ok.status === 200, `status=${ok.status}`);
    const net = await prisma.cashboxEntry.findMany({ where: { dealId } });
    const netSum = net.reduce((a, e) => a + (e.type === "IN" ? e.amount : -e.amount), BigInt(0));
    check(tag, "canceled-net-zero", netSum === BigInt(0), `net=${netSum} entries=${net.length}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: commission edit respects amount-vs-percent check", async () => {
    const tag = "edge-commission-edit";
    const customer = poolCustomers[4];
    const property = await makeProperty("SALE", BigInt(5_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(5_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(50_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "edit-consistent", dealId, { commissionPercent: 2, commissionToman: "100000000" });
    await patchDeal(tag, "edit-inconsistent", dealId, { commissionPercent: 2, commissionToman: "100100000" }, 400);
    const rentProp = await makeProperty("RENT", BigInt(500_000_000), BigInt(50_000_000));
    const rentDeal = await postDeal(tag, {
      dealType: "RENT", price: BigInt(500_000_000), monthlyRent: BigInt(50_000_000),
      percent: null, commission: BigInt(30_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, rentProp.id);
    if (expectStatus(tag, "create-rent", rentDeal, 201)) {
      await patchDeal(tag, "edit-rent-arbitrary", rentDeal.json.id as string, { commissionToman: "77777777" });
    }
    scenariosRun += 2;
    await verifyGlobal(tag);
  });

  it("edge: money lock after settlement", async () => {
    const tag = "edge-money-lock";
    const customer = poolCustomers[0];
    const property = await makeProperty("SALE", BigInt(4_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(4_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(40_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }] });
    const d = await loadDealFull(dealId);
    setSession(ownerUser);
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${d!.shares[0].id}`, d!.shares[0].id, { settled: true });
    await patchDeal(tag, "money-edit-blocked", dealId, { commissionToman: "41000000" }, 400);
    await patchDeal(tag, "split-edit-blocked", dealId, { officePct: 60, shares: [{ userId: agentUsers[0].id, pct: 40 }] }, 400);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: manual cashbox entries", async () => {
    const tag = "edge-manual-cashbox";
    setSession(ownerUser);
    const before = await callGET<CashboxJson>(cashboxGET, `${BASE_URL}/api/accounting/cashbox`);
    const balBefore = BigInt(before.json.balance);
    const r1 = await callPOST<DealJson>(cashboxPOST, `${BASE_URL}/api/accounting/cashbox`, { type: "IN", amount: "10000000", title: `${MARK} - دستی ورودی` });
    expectStatus(tag, "manual-in", r1, 201);
    if (r1.status === 201) testCashboxIds.add(r1.json.id);
    const r2 = await callPOST<DealJson>(cashboxPOST, `${BASE_URL}/api/accounting/cashbox`, { type: "OUT", amount: "4000000", title: `${MARK} - دستی خروجی` });
    expectStatus(tag, "manual-out", r2, 201);
    if (r2.status === 201) testCashboxIds.add(r2.json.id);
    const after = await callGET<CashboxJson>(cashboxGET, `${BASE_URL}/api/accounting/cashbox`);
    check(tag, "manual-balance", BigInt(after.json.balance) === balBefore + BigInt(6_000_000), `before=${balBefore} after=${after.json.balance}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: undetermined deal (no commission, no shirini)", async () => {
    const tag = "edge-undetermined";
    const customer = poolCustomers[1];
    const property = await makeProperty("SALE", BigInt(2_500_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(2_500_000_000), monthlyRent: BigInt(0),
      percent: null, commission: null, sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 100, shares: [], status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    setSession(ownerUser);
    const recv = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    expectStatus(tag, "receive-undetermined-blocked", recv, 400);
    const list = await callGET<CommissionListItem[]>(commissionsGET, `${BASE_URL}/api/accounting/commissions?paid=all`);
    const found = list.json.find((d) => d.id === dealId);
    check(tag, "undetermined-in-list", !!found, "undetermined deal missing from commissions list");
    const s = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    check(tag, "undetermined-counted-in-deals", BigInt(s.json.dealsCompleted) >= BigInt(BASELINE.dealsCompleted + 1), `dealsCompleted=${s.json.dealsCompleted}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: pending lifecycle (not counted until completed)", async () => {
    const tag = "edge-pending-lifecycle";
    const customer = poolCustomers[2];
    const property = await makeProperty("SALE", BigInt(7_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(7_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(70_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "PENDING",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create-pending", created, 201)) return;
    const dealId = created.json.id as string;
    setSession(ownerUser);
    const s1 = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    const before = BigInt(s1.json.commissionTotal);
    await patchDeal(tag, "complete", dealId, { status: "COMPLETED" });
    const s2 = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    check(tag, "completed-adds-commission", BigInt(s2.json.commissionTotal) === before + BigInt(70_000_000), `before=${before} after=${s2.json.commissionTotal}`);
    await patchDeal(tag, "cancel", dealId, { status: "CANCELED" });
    const s3 = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    check(tag, "canceled-removes-commission", BigInt(s3.json.commissionTotal) === before, `after-cancel=${s3.json.commissionTotal} before=${before}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: double receive/settle idempotency + re-receive reactivates", async () => {
    const tag = "edge-idempotency";
    const customer = poolCustomers[3];
    const property = await makeProperty("SALE", BigInt(9_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(9_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(90_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "split", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }] });
    setSession(ownerUser);
    const r1 = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    const r2 = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    expectStatus(tag, "receive-1", r1, 200);
    expectStatus(tag, "receive-2", r2, 200);
    const ins = await prisma.cashboxEntry.count({ where: { dealId, type: "IN" } });
    check(tag, "single-in-after-double-receive", ins === 1, `IN rows=${ins}`);
    const d = await loadDealFull(dealId);
    const shareId = d!.shares[0].id;
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${shareId}`, shareId, { settled: true });
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${shareId}`, shareId, { settled: true });
    const outs = await prisma.cashboxEntry.count({ where: { shareId, type: "OUT" } });
    check(tag, "single-out-after-double-settle", outs === 1, `OUT rows=${outs}`);
    await callPATCH(shareSettlePATCH, `${BASE_URL}/api/accounting/shares/${shareId}`, shareId, { settled: false });
    const rr = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: false });
    expectStatus(tag, "reverse-receipt", rr, 200);
    const r3 = await callPATCH(commissionSettlePATCH, `${BASE_URL}/api/accounting/commissions/${dealId}`, dealId, { commissionPaid: true });
    expectStatus(tag, "re-receive", r3, 200);
    const reversalOut = await prisma.cashboxEntry.count({ where: { dealId, type: "OUT" } });
    check(tag, "reversal-out-deleted-on-re-receive", reversalOut === 0, `OUT rows for deal=${reversalOut}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: agent permissions and scoping", async () => {
    const tag = "edge-agent-scoping";
    const agent = agentUsers[0];
    setSession(agent);
    const a = await callGET<AgentsJson>(agentsGET, `${BASE_URL}/api/accounting/agents`);
    expectStatus(tag, "agents-403-for-agent", a, 403);
    const c = await callGET<CashboxJson>(cashboxGET, `${BASE_URL}/api/accounting/cashbox`);
    expectStatus(tag, "cashbox-403-for-agent", c, 403);
    const s = await callGET<SummaryJson>(summaryGET, `${BASE_URL}/api/accounting/summary`);
    expectStatus(tag, "summary-200-for-agent", s, 200);
    await verifyAgentSummary(tag, agent);
    await verifyAgentSummary(tag, agentUsers[1]);
    scenariosRun += 2;
  });

  it("edge: office 100 with no shares — semantic check", async () => {
    const tag = "edge-office-100-no-shares";
    const customer = poolCustomers[4];
    const property = await makeProperty("SALE", BigInt(3_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(3_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(30_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 100, shares: [], status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    const split = await patchDeal(tag, "split-office-100", dealId, { officePct: 100, shares: [] });
    if (split.status !== 200) return;
    setSession(ownerUser);
    const list = await callGET<CommissionListItem[]>(commissionsGET, `${BASE_URL}/api/accounting/commissions?paid=all`);
    const row = list.json.find((d) => d.id === dealId);
    // Stored officePct is 100, so the office receives the whole base and the
    // deal agent gets no (virtual) share — new rule, Behzad 2026-11-20.
    check(tag, "office-100-means-office-gets-all", !!row && BigInt(row.officeAmount ?? 0) === BigInt(30_000_000), `officeAmount=${row?.officeAmount} shares=${JSON.stringify(row?.shares)}`);
    check(tag, "office-100-means-no-agent-share", !!row && row.shares.length === 0, `shares=${JSON.stringify(row?.shares)}`);
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  it("edge: discount over gross and split not 100 rejected", async () => {
    const tag = "edge-validation-rejections";
    const customer = poolCustomers[0];
    const property = await makeProperty("SALE", BigInt(2_000_000_000), null);
    const created = await postDeal(tag, {
      dealType: "SALE", price: BigInt(2_000_000_000), monthlyRent: BigInt(0),
      percent: 1, commission: BigInt(20_000_000), sellerShirini: BigInt(0), buyerShirini: BigInt(0),
      discount: BigInt(0), officePct: 50,
      shares: [{ userId: agentUsers[0].id, name: agentUsers[0].name, pct: 50 }],
      status: "COMPLETED",
    }, customer.id, property.id);
    if (!expectStatus(tag, "create", created, 201)) return;
    const dealId = created.json.id as string;
    await patchDeal(tag, "discount-over-gross", dealId, { discountToman: "21000000" }, 400);
    await patchDeal(tag, "split-not-100", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 40 }] }, 400);
    await patchDeal(tag, "split-ok", dealId, { officePct: 50, shares: [{ userId: agentUsers[0].id, pct: 50 }] });
    scenariosRun += 1;
    await verifyGlobal(tag);
  });

  // --- randomized scenarios ---
  it(
    `randomized scenarios (seed 20261120, n=${TOTAL_RANDOM})`,
    async () => {
      for (let i = 0; i < TOTAL_RANDOM; i++) {
        await runScenario(i);
        scenariosRun += 1;
      }
    },
    900_000,
  );

  it("final: failure count is zero", () => {
    if (failures.length > 0) {
      console.log(`[stress] ${failures.length} failures recorded (see afterAll log)`);
    }
    expect(failures.length, failures.slice(0, 10).map((f) => `${f.scenario}::${f.step}::${f.detail}`).join("\n")).toBe(0);
  });
});
