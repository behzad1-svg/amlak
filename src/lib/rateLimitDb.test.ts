import { describe, it, expect } from "vitest";
import { ipRateLimitKey, phoneRateLimitKey, rateLimitForKey } from "./rateLimitDb";

describe("rate limit keys (round 10: composite phone key)", () => {
  it("builds a composite phone key with IP", () => {
    expect(phoneRateLimitKey("09170000001", "1.2.3.4")).toBe("login:phone:09170000001:1.2.3.4");
  });

  it("falls back to a phone-only key when IP is null", () => {
    expect(phoneRateLimitKey("09170000001", null)).toBe("login:phone:09170000001");
  });

  it("builds an IP key", () => {
    expect(ipRateLimitKey("1.2.3.4")).toBe("login:ip:1.2.3.4");
  });

  it("caps IP keys at 20 and phone keys at 5", () => {
    expect(rateLimitForKey("login:ip:1.2.3.4")).toBe(20);
    expect(rateLimitForKey("login:phone:09170000001:1.2.3.4")).toBe(5);
    expect(rateLimitForKey("login:phone:09170000001")).toBe(5);
  });
});
