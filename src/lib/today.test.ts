import { describe, expect, it } from "vitest";
import { tehranDayBounds, todayFollowUpWindow } from "./today";

describe("tehranDayBounds", () => {
  it("starts the Tehran day at 20:30 UTC the day before", () => {
    // 2026-11-21 00:00 UTC = 03:30 Tehran on 30 Aban
    const { start, end } = tehranDayBounds(new Date("2026-11-21T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-20T20:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-21T20:29:59.999Z");
  });

  it("a late UTC evening is still the same Tehran day", () => {
    // 2026-11-21 20:00 UTC = 23:30 Tehran on 30 Aban
    const { start } = tehranDayBounds(new Date("2026-11-21T20:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-20T20:30:00.000Z");
  });

  it("just after Tehran midnight starts a new day", () => {
    // 2026-11-21 20:30 UTC = 2026-11-22 00:00 Tehran
    const { start, end } = tehranDayBounds(new Date("2026-11-21T20:30:00Z"));
    expect(start.toISOString()).toBe("2026-11-21T20:30:00.000Z");
    expect(end.toISOString()).toBe("2026-11-22T20:29:59.999Z");
  });
});

describe("todayFollowUpWindow", () => {
  it("covers from now until the end of the Tehran day", () => {
    // 2026-11-21 07:00 UTC = 10:30 Tehran, 30 Aban
    const now = new Date("2026-11-21T07:00:00Z");
    const { from, to } = todayFollowUpWindow(now);
    expect(from).toBe(now);
    expect(to.toISOString()).toBe("2026-11-21T20:29:59.999Z");
  });

  it("includes a follow-up due later today and excludes yesterday and tomorrow", () => {
    const now = new Date("2026-11-21T07:00:00Z");
    const { from, to } = todayFollowUpWindow(now);
    const laterToday = new Date("2026-11-21T12:00:00Z"); // 15:30 Tehran, same day
    const yesterday = new Date("2026-11-20T12:00:00Z");
    const tomorrow = new Date("2026-11-22T00:00:00Z"); // 03:30 Tehran, next day
    expect(laterToday.getTime()).toBeGreaterThanOrEqual(from.getTime());
    expect(laterToday.getTime()).toBeLessThanOrEqual(to.getTime());
    expect(yesterday.getTime()).toBeLessThan(from.getTime());
    expect(tomorrow.getTime()).toBeGreaterThan(to.getTime());
  });
});
