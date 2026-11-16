import { describe, it, expect } from "vitest";
import { cashboxBalanceFromTotals } from "./cashbox";

describe("cashboxBalanceFromTotals", () => {
  it("empty totals -> 0", () => {
    expect(cashboxBalanceFromTotals([])).toBe(BigInt(0));
  });

  it("IN only", () => {
    expect(
      cashboxBalanceFromTotals([{ type: "IN", _sum: { amount: BigInt(1500) } }])
    ).toBe(BigInt(1500));
  });

  it("IN minus OUT", () => {
    expect(
      cashboxBalanceFromTotals([
        { type: "IN", _sum: { amount: BigInt(1000) } },
        { type: "OUT", _sum: { amount: BigInt(400) } },
      ])
    ).toBe(BigInt(600));
  });

  it("null sums count as 0 (groupBy omits empty types, but a null sum must not crash)", () => {
    expect(
      cashboxBalanceFromTotals([
        { type: "IN", _sum: { amount: null } },
        { type: "OUT", _sum: { amount: BigInt(250) } },
      ])
    ).toBe(BigInt(-250));
  });

  it("OUT only -> negative balance", () => {
    expect(
      cashboxBalanceFromTotals([{ type: "OUT", _sum: { amount: BigInt(75) } }])
    ).toBe(BigInt(-75));
  });
});
