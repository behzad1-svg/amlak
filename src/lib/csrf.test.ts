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

describe("isForeignOrigin allowlist (only the known site origin)", () => {
  it("allows the site Origin (only the known site origin is trusted)", () => {
    expect(isForeignOrigin(SITE, null, SITE)).toBe(false);
    expect(isForeignOrigin(null, `${SITE}/dashboard`, SITE)).toBe(false);
  });

  it("rejects a foreign Origin even when the request Host is the site host", () => {
    expect(isForeignOrigin("https://evil.example.com", null, SITE)).toBe(true);
    expect(isForeignOrigin(null, "https://evil.example.com/login", SITE)).toBe(true);
  });

  it("ignores scheme and port differences when comparing hosts", () => {
    expect(isForeignOrigin("https://crm.amlaksaj.ir:443", null, SITE)).toBe(false);
    expect(isForeignOrigin("http://crm.amlaksaj.ir:3000", null, SITE)).toBe(false);
  });

  it("rejects a lookalike subdomain", () => {
    expect(isForeignOrigin("https://crm.amlaksaj.ir.evil.example.com", null, SITE)).toBe(true);
  });
});
