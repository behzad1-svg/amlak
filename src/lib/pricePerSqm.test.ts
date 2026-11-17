import { describe, expect, it } from "vitest";
import { calcPerMetre, calcTotal } from "./pricePerSqm";

describe("calcPerMetre", () => {
  it("computes per-metre from total and size", () => {
    expect(calcPerMetre("3500000000", 100)).toBe("35000000");
  });
  it("returns empty string when total is cleared", () => {
    expect(calcPerMetre("", 100)).toBe("");
  });
  it("returns null without a base size", () => {
    expect(calcPerMetre("3500000000", 0)).toBeNull();
  });
  it("returns null for a non-positive result", () => {
    expect(calcPerMetre("0", 100)).toBeNull();
  });
});

describe("calcTotal", () => {
  it("computes total from per-metre and size", () => {
    expect(calcTotal("35000000", 100)).toBe("3500000000");
  });
  it("returns empty string when per-metre is cleared", () => {
    expect(calcTotal("", 100)).toBe("");
  });
  it("returns null without a base size", () => {
    expect(calcTotal("35000000", 0)).toBeNull();
  });
});
