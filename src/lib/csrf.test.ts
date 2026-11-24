import { describe, it, expect } from "vitest";
import { isForeignOrigin, needsOriginCheck } from "./csrf";

const SITE = "https://crm.amlaksaj.ir";

describe("isForeignOrigin", () => {
  it("allows requests without Origin or Referer (server-to-server, e.g. cron)", () => {
    expect(isForeignOrigin(null, null, SITE)).toBe(false);
  });

  it("allows same-origin Origin", () => {
    expect(isForeignOrigin(SITE, null, SITE)).toBe(false);
  });

  it("allows same-origin Referer when Origin is absent", () => {
    expect(isForeignOrigin(null, `${SITE}/customers`, SITE)).toBe(false);
  });

  it("rejects a foreign Origin", () => {
    expect(isForeignOrigin("https://evil.example.com", null, SITE)).toBe(true);
  });

  it("rejects a foreign Referer when Origin is absent", () => {
    expect(isForeignOrigin(null, "https://evil.example.com/login", SITE)).toBe(true);
  });

  it("prefers Origin over Referer", () => {
    expect(isForeignOrigin(SITE, "https://evil.example.com/", SITE)).toBe(false);
    expect(isForeignOrigin("https://evil.example.com", `${SITE}/`, SITE)).toBe(true);
  });

  it("rejects an unparseable candidate", () => {
    expect(isForeignOrigin("not-a-url", null, SITE)).toBe(true);
    expect(isForeignOrigin("null", null, SITE)).toBe(true);
  });
});

describe("needsOriginCheck", () => {
  it("checks mutating API requests", () => {
    expect(needsOriginCheck("POST", "/api/customers")).toBe(true);
    expect(needsOriginCheck("PUT", "/api/deals/1")).toBe(true);
    expect(needsOriginCheck("DELETE", "/api/tasks/1")).toBe(true);
    expect(needsOriginCheck("POST", "/api/auth/login")).toBe(true);
  });

  it("skips GET API requests and non-API paths", () => {
    expect(needsOriginCheck("GET", "/api/customers")).toBe(false);
    expect(needsOriginCheck("POST", "/login")).toBe(false);
    expect(needsOriginCheck("POST", "/dashboard")).toBe(false);
  });
});

describe("isForeignOrigin behind a CDN / reverse proxy", () => {
  it("allows the site Origin when the app sees an internal origin (WCDN + Caddy)", () => {
    // پشت WCDN و Caddy، ‏Next.js مبدأ داخلی را می‌بیند؛
    // هاست هدر Host همان هاست عمومی سایت است.
    expect(isForeignOrigin(SITE, null, "http://127.0.0.1:3000", "crm.amlaksaj.ir")).toBe(false);
    expect(isForeignOrigin(null, `${SITE}/dashboard`, "http://127.0.0.1:3000", "crm.amlaksaj.ir")).toBe(false);
  });

  it("rejects a foreign Origin even when the request Host is the site host", () => {
    expect(isForeignOrigin("https://evil.example.com", null, SITE, "crm.amlaksaj.ir")).toBe(true);
    expect(isForeignOrigin(null, "https://evil.example.com/login", SITE, "crm.amlaksaj.ir")).toBe(true);
  });

  it("ignores scheme and port differences when comparing hosts", () => {
    expect(isForeignOrigin("https://crm.amlaksaj.ir:443", null, SITE, "crm.amlaksaj.ir")).toBe(false);
    expect(isForeignOrigin("http://crm.amlaksaj.ir:3000", null, SITE, "crm.amlaksaj.ir")).toBe(false);
  });

  it("rejects a lookalike subdomain", () => {
    expect(isForeignOrigin("https://crm.amlaksaj.ir.evil.example.com", null, SITE, "crm.amlaksaj.ir")).toBe(true);
  });
});
