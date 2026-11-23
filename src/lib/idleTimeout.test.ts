import { describe, expect, it } from "vitest";
import {
  IDLE_ACTIVITY_THROTTLE_MS,
  IDLE_CHECK_INTERVAL_MS,
  IDLE_STORAGE_KEY,
  IDLE_TIMEOUT_MS,
  isIdleExpired,
  parseLastActivity,
  shouldRecordActivity,
} from "./idleTimeout";

describe("idle timeout constants", () => {
  it("idle timeout is exactly 20 minutes", () => {
    expect(IDLE_TIMEOUT_MS).toBe(20 * 60 * 1000);
  });

  it("check interval and throttle are 30 seconds", () => {
    expect(IDLE_CHECK_INTERVAL_MS).toBe(30 * 1000);
    expect(IDLE_ACTIVITY_THROTTLE_MS).toBe(30 * 1000);
  });

  it("storage key is stable", () => {
    expect(IDLE_STORAGE_KEY).toBe("saj_last_activity");
  });
});

describe("isIdleExpired", () => {
  const now = 1_800_000_000_000;

  it("expires exactly at 20 minutes of inactivity", () => {
    expect(isIdleExpired(now - IDLE_TIMEOUT_MS, now)).toBe(true);
  });

  it("does not expire one millisecond before the timeout", () => {
    expect(isIdleExpired(now - IDLE_TIMEOUT_MS + 1, now)).toBe(false);
  });

  it("expires well past the timeout", () => {
    expect(isIdleExpired(now - 60 * 60 * 1000, now)).toBe(true);
  });

  it("expires just past the timeout (mount check after a restart)", () => {
    expect(isIdleExpired(now - 21 * 60 * 1000, now)).toBe(true);
  });

  it("does not expire for recent activity", () => {
    expect(isIdleExpired(now - 60 * 1000, now)).toBe(false);
  });

  it("does not expire for a future timestamp (clock skew / other tab)", () => {
    expect(isIdleExpired(now + 60 * 1000, now)).toBe(false);
  });

  it("treats missing or invalid timestamps as not expired (never kick a fresh login)", () => {
    expect(isIdleExpired(null, now)).toBe(false);
    expect(isIdleExpired(undefined, now)).toBe(false);
    expect(isIdleExpired(NaN, now)).toBe(false);
    expect(isIdleExpired(0, now)).toBe(false);
    expect(isIdleExpired(-100, now)).toBe(false);
  });

  it("respects a custom timeout", () => {
    expect(isIdleExpired(now - 5 * 60 * 1000, now, 10 * 60 * 1000)).toBe(false);
    expect(isIdleExpired(now - 11 * 60 * 1000, now, 10 * 60 * 1000)).toBe(true);
  });
});

describe("parseLastActivity", () => {
  it("parses a stored millisecond timestamp", () => {
    expect(parseLastActivity("1795360000000")).toBe(1795360000000);
  });

  it("returns null for null, empty or non-numeric values", () => {
    expect(parseLastActivity(null)).toBeNull();
    expect(parseLastActivity("")).toBeNull();
    expect(parseLastActivity("abc")).toBeNull();
  });

  it("returns null for zero or negative values", () => {
    expect(parseLastActivity("0")).toBeNull();
    expect(parseLastActivity("-5")).toBeNull();
  });
});

describe("shouldRecordActivity", () => {
  const now = 1_800_000_000_000;

  it("records when nothing was recorded before", () => {
    expect(shouldRecordActivity(null, now)).toBe(true);
    expect(shouldRecordActivity(undefined, now)).toBe(true);
    expect(shouldRecordActivity(0, now)).toBe(true);
  });

  it("throttles writes inside the throttle window", () => {
    expect(shouldRecordActivity(now - 1000, now)).toBe(false);
    expect(shouldRecordActivity(now - IDLE_ACTIVITY_THROTTLE_MS + 1, now)).toBe(false);
  });

  it("records once the throttle window has passed", () => {
    expect(shouldRecordActivity(now - IDLE_ACTIVITY_THROTTLE_MS, now)).toBe(true);
    expect(shouldRecordActivity(now - 60 * 1000, now)).toBe(true);
  });
});
