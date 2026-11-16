import { describe, it, expect, vi, afterEach } from "vitest";
import { clientIpFromHeaders } from "./clientIp";

function headers(entries: Record<string, string>): { get(name: string): string | null } {
  const map = new Map(Object.entries(entries));
  return { get: (name: string) => map.get(name) ?? null };
}

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null when TRUSTED_PROXY is not true", () => {
    vi.stubEnv("TRUSTED_PROXY", "false");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe(null);
  });

  it("returns null when TRUSTED_PROXY is unset", () => {
    vi.stubEnv("TRUSTED_PROXY", "");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4" }))).toBe(null);
  });

  it("returns the first XFF entry", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("trims whitespace around the first XFF entry", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "  9.9.9.9  , 1.1.1.1" }))).toBe("9.9.9.9");
  });

  it("empty XFF falls through to x-real-ip", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "", "x-real-ip": "2.3.4.5" }))
    ).toBe("2.3.4.5");
  });

  it("whitespace-only XFF falls through to x-real-ip", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "   ", "x-real-ip": "2.3.4.5" }))
    ).toBe("2.3.4.5");
  });

  it("falls back to x-real-ip when XFF is missing", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-real-ip": "3.4.5.6" }))).toBe("3.4.5.6");
  });

  it("returns null when both headers are missing", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({}))).toBe(null);
  });
});
