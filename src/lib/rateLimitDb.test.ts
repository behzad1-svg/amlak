import { describe, it, expect } from "vitest";
import { forgotIpRateLimitKey, forgotPhoneOnlyRateLimitKey, forgotPhoneRateLimitKey, ipRateLimitKey, phoneOnlyRateLimitKey, phoneRateLimitKey, rateLimitForKey } from "./rateLimitDb";

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

  it("builds an IP-independent phone-only key capped at 50", () => {
    expect(phoneOnlyRateLimitKey("09170000001")).toBe("login:phone-only:09170000001");
    // مستقل از IP: همان کلید برای هر IP — چرخش IP سطل تازه نمی‌سازد.
    expect(phoneOnlyRateLimitKey("09170000001")).not.toBe(phoneRateLimitKey("09170000001", "1.2.3.4"));
    expect(rateLimitForKey("login:phone-only:09170000001")).toBe(50);
  });
});

describe("forgot-password rate limit keys", () => {
  it("builds forgot keys mirroring the login buckets", () => {
    expect(forgotIpRateLimitKey("1.2.3.4")).toBe("forgot:ip:1.2.3.4");
    expect(forgotPhoneRateLimitKey("09170000001", "1.2.3.4")).toBe("forgot:phone:09170000001:1.2.3.4");
    expect(forgotPhoneRateLimitKey("09170000001", null)).toBe("forgot:phone:09170000001");
    expect(forgotPhoneOnlyRateLimitKey("09170000001")).toBe("forgot:phone-only:09170000001");
  });

  it("caps forgot IP keys at 20, phone keys at 5, phone-only at 50", () => {
    expect(rateLimitForKey("forgot:ip:1.2.3.4")).toBe(20);
    expect(rateLimitForKey("forgot:phone:09170000001:1.2.3.4")).toBe(5);
    expect(rateLimitForKey("forgot:phone:09170000001")).toBe(5);
    expect(rateLimitForKey("forgot:phone-only:09170000001")).toBe(50);
  });
});
