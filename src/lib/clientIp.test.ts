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
    expect(clientIpFromHeaders(headers({ "x-real-ip": "1.2.3.4" }))).toBe(null);
  });

  it("returns null when TRUSTED_PROXY is unset", () => {
    vi.stubEnv("TRUSTED_PROXY", "");
    expect(clientIpFromHeaders(headers({ "x-real-ip": "1.2.3.4" }))).toBe(null);
  });

  it("reads x-real-ip only and ignores x-forwarded-for", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8", "x-real-ip": "9.9.9.9" }))
    ).toBe("9.9.9.9");
  });

  it("ignores a forged x-forwarded-for chain when x-real-ip is missing", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" }))).toBe(null);
  });

  it("trims whitespace around x-real-ip", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-real-ip": "  2.3.4.5  " }))).toBe("2.3.4.5");
  });

  it("returns null when x-real-ip is empty", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "" }))).toBe(null);
  });

  it("returns null when both headers are missing", () => {
    vi.stubEnv("TRUSTED_PROXY", "true");
    expect(clientIpFromHeaders(headers({}))).toBe(null);
  });
});
