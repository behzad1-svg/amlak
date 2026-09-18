/**
 * Smoke checks against a running app (npm run dev / start).
 * Usage: BASE_URL=http://localhost:3000 SMOKE_PHONE=... SMOKE_PASSWORD=... npm run smoke
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
const PHONE = process.env.SMOKE_PHONE || "09170000001";
const PASSWORD = process.env.SMOKE_PASSWORD || process.env.SEED_PASSWORD || "";

let passed = 0;
let failed = 0;

function ok(name) {
  passed++;
  console.log(`  ✓ ${name}`);
}
function bad(name, detail) {
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(path, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json, setCookie, headers: res.headers };
}

function extractToken(setCookie) {
  const line = setCookie.find((c) => c.startsWith("saj_token="));
  if (!line) return null;
  return line.split(";")[0];
}

async function main() {
  console.log(`Smoke → ${BASE}\n`);

  // 1) Health is public
  {
    const r = await req("/api/health");
    if (r.status === 200 && r.json?.status === "ok") ok("health public + db ok");
    else bad("health", `${r.status} ${JSON.stringify(r.json)}`);
  }

  // 2) Seed not public — middleware 401 without cookie; route 403 without SEED_ENABLED
  {
    const r = await req("/api/seed");
    if (r.status === 401 || r.status === 403) ok(`seed not public (got ${r.status})`);
    else bad("seed not public", `expected 401/403 got ${r.status}`);
  }

  // 3) Security headers on login page
  {
    const r = await req("/login");
    const xfo = r.headers.get("x-frame-options");
    const nosniff = r.headers.get("x-content-type-options");
    if (xfo === "DENY" && nosniff === "nosniff") ok("security headers present");
    else bad("security headers", `xfo=${xfo} nosniff=${nosniff}`);
  }

  if (!PASSWORD) {
    console.log("\n(skip auth flows — set SMOKE_PASSWORD or SEED_PASSWORD)");
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  }

  // 4) Login
  let cookie = null;
  {
    const r = await req("/api/auth/login", {
      method: "POST",
      body: { phone: PHONE, password: PASSWORD },
    });
    cookie = extractToken(r.setCookie);
    if (r.status === 200 && cookie) ok(`login as ${PHONE}`);
    else bad("login", `${r.status} ${JSON.stringify(r.json)}`);
  }

  if (!cookie) {
    console.log(`Result: ${passed} passed, ${failed} failed`);
    process.exit(1);
  }

  // 5) me
  {
    const r = await req("/api/auth/me", { cookie });
    if (r.status === 200 && r.json?.user?.phone === PHONE) ok("auth/me");
    else bad("auth/me", `${r.status} ${JSON.stringify(r.json)}`);
  }

  // 6) Unauthorized API without cookie
  {
    const r = await req("/api/customers");
    if (r.status === 401) ok("customers requires auth");
    else bad("customers 401", `got ${r.status}`);
  }

  // 7) Create customer + phone unique
  const stamp = String(Date.now()).slice(-8);
  const phone = `09${stamp}`;
  let customerId = null;
  {
    const r = await req("/api/customers", {
      method: "POST",
      cookie,
      body: {
        name: `Smoke ${stamp}`,
        phone,
        type: "BUYER",
        preferredDealType: "SALE",
        budgetMax: "5000000000",
      },
    });
    customerId = r.json?.id;
    if (r.status === 201 && customerId) ok("create customer");
    else bad("create customer", `${r.status} ${JSON.stringify(r.json)}`);

    const dup = await req("/api/customers", {
      method: "POST",
      cookie,
      body: { name: `Dup ${stamp}`, phone, type: "BUYER" },
    });
    if (dup.status === 409) ok("duplicate phone → 409");
    else bad("duplicate phone", `expected 409 got ${dup.status}`);
  }

  // 8) Search by phone
  {
    const r = await req(`/api/customers?search=${phone}`, { cookie });
    const list = Array.isArray(r.json) ? r.json : r.json?.customers;
    if (Array.isArray(list) && list.some((c) => c.phone === phone)) ok("search by phone");
    else bad("search by phone", JSON.stringify(r.json)?.slice(0, 200));
  }

  // 9) Create property + deal
  let propertyId = null;
  if (customerId) {
    const owner = await req("/api/customers", {
      method: "POST",
      cookie,
      body: {
        name: `Owner ${stamp}`,
        phone: `08${stamp}`,
        type: "SELLER",
      },
    });
    const ownerId = owner.json?.id || customerId;
    if (owner.status === 201) ok("create owner customer");
    else if (owner.status === 409) ok("owner phone already exists (ok)");
    else bad("create owner", `${owner.status}`);

    const prop = await req("/api/properties", {
      method: "POST",
      cookie,
      body: {
        title: `Smoke unit ${stamp}`,
        type: "APARTMENT",
        dealType: "SALE",
        salePriceToman: "1000000000",
        region: "بهمنی",
        ownerId,
        visibility: "TEAM_VISIBLE",
      },
    });
    propertyId = prop.json?.id;
    if (prop.status === 201 && propertyId) ok("create property");
    else bad("create property", `${prop.status} ${JSON.stringify(prop.json)}`);

    if (propertyId && customerId) {
      const deal = await req("/api/deals", {
        method: "POST",
        cookie,
        body: {
          customerId,
          propertyId,
          status: "PENDING",
          notes: "smoke",
        },
      });
      if (deal.status === 201) ok("create deal PENDING");
      else bad("create deal", `${deal.status} ${JSON.stringify(deal.json)}`);

      const deal2 = await req("/api/deals", {
        method: "POST",
        cookie,
        body: { customerId, propertyId, status: "PENDING" },
      });
      if (deal2.status === 409) ok("second open deal on property → 409");
      else bad("second open deal", `expected 409 got ${deal2.status}`);
    }
  }

  // 10) Seed still locked with cookie but without SEED_ENABLED
  {
    const r = await req("/api/seed", { cookie });
    if (r.status === 403) ok("seed locked even when authenticated (no flag)");
    else bad("seed authenticated", `expected 403 got ${r.status}`);
  }

  // 11) Logout invalidates token
  {
    const out = await req("/api/auth/logout", { method: "POST", cookie });
    if (out.status === 200) ok("logout ok");
    else bad("logout", `${out.status}`);

    const after = await req("/api/auth/me", { cookie });
    if (after.status === 401) ok("old token invalid after logout");
    else bad("token after logout", `expected 401 got ${after.status}`);
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
