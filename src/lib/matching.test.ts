import { describe, expect, it } from "vitest";
import { budgetScore, rentBudgetScore, scorePair } from "./matching";

describe("budgetScore", () => {
  it("treats a zero cap as no cap instead of throwing", () => {
    expect(() => budgetScore(BigInt(0), BigInt(100))).not.toThrow();
    expect(budgetScore(BigInt(0), BigInt(100))).toBeNull();
    // بدون سقف ولی با کف: فقط کف چک می‌شود
    expect(budgetScore(BigInt(0), BigInt(100), BigInt(50))).toBe(90);
    expect(budgetScore(BigInt(0), BigInt(30), BigInt(50))).toBe(40);
  });

  it("scores positive budgets exactly as before", () => {
    expect(budgetScore(null, BigInt(100))).toBeNull();
    expect(budgetScore(BigInt(100), null)).toBeNull();
    expect(budgetScore(BigInt(100), BigInt(100))).toBe(100);
    expect(budgetScore(BigInt(100), BigInt(105))).toBe(80);
    expect(budgetScore(BigInt(100), BigInt(110))).toBe(70);
    expect(budgetScore(BigInt(100), BigInt(111))).toBeNull();
    expect(budgetScore(BigInt(100), BigInt(50))).toBe(26);
    expect(budgetScore(BigInt(100), BigInt(10), BigInt(50))).toBeNull();
  });
});

describe("rentBudgetScore", () => {
  it("treats zero caps as no cap instead of throwing", () => {
    expect(() => rentBudgetScore(BigInt(0), BigInt(0), BigInt(1_000_000_000), BigInt(10_000_000))).not.toThrow();
    expect(rentBudgetScore(BigInt(0), BigInt(0), BigInt(1_000_000_000), BigInt(10_000_000))).toBeNull();
    expect(rentBudgetScore(null, BigInt(0), null, BigInt(10_000_000))).toBeNull();
    // فقط سقف ودیعه صفر است — سقف ماهانه نادیده گرفته می‌شود
    expect(rentBudgetScore(BigInt(1_000_000_000), BigInt(0), BigInt(1_000_000_000), BigInt(10_000_000))).toBe(100);
  });

  it("scores positive rent caps exactly as before", () => {
    expect(rentBudgetScore(null, BigInt(10_000_000), null, BigInt(10_000_000))).toBe(100);
    expect(rentBudgetScore(null, BigInt(10_000_000), null, BigInt(12_000_000))).toBeNull();
    expect(rentBudgetScore(BigInt(1_000_000_000), null, BigInt(1_200_000_000), null)).toBeNull();
  });
});

describe("scorePair with zero budgets", () => {
  const zeroBudgetCust = {
    preferredDealType: null,
    preferredType: null,
    preferredArea: null,
    preferredAreas: null,
    preferredBeds: 2,
    preferredSizeMin: null,
    preferredSizeMax: null,
    budgetMin: BigInt(0),
    budgetMax: BigInt(0),
    budgetMaxMonthly: BigInt(0),
  };

  it("does not reject a zero-budget customer — it is treated as no cap", () => {
    const prop = {
      dealType: "SALE",
      type: "APARTMENT",
      region: "x",
      salePriceToman: BigInt(100_000_000),
      depositToman: null,
      monthlyRentToman: null,
      sizeSqm: 100,
      beds: 2,
    };
    expect(() => scorePair(zeroBudgetCust, prop)).not.toThrow();
    expect(scorePair(zeroBudgetCust, prop)?.score).toBe(100);
  });

  it("does not throw on the rent path with zero caps", () => {
    const cust = { ...zeroBudgetCust, preferredDealType: "RENT" };
    const prop = {
      dealType: "RENT",
      type: "APARTMENT",
      region: "x",
      salePriceToman: null,
      depositToman: BigInt(1_000_000_000),
      monthlyRentToman: BigInt(10_000_000),
      sizeSqm: 100,
      beds: 2,
    };
    expect(() => scorePair(cust, prop)).not.toThrow();
    expect(scorePair(cust, prop)?.score).toBe(100);
  });

  it("still rejects a property clearly over a positive budget", () => {
    const cust = { ...zeroBudgetCust, budgetMin: null, budgetMax: BigInt(100_000_000) };
    const prop = {
      dealType: "SALE",
      type: "APARTMENT",
      region: "x",
      salePriceToman: BigInt(200_000_000),
      depositToman: null,
      monthlyRentToman: null,
      sizeSqm: 100,
      beds: 2,
    };
    expect(scorePair(cust, prop)).toBeNull();
  });
});
