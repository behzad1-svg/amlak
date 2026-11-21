import { describe, expect, it } from "vitest";
import { tehranDayBounds } from "./today";

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
