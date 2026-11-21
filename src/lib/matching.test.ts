import { describe, expect, it, vi } from "vitest";
import { budgetScore, deleteMatchNotificationsForSource, rentBudgetScore, scorePair } from "./matching";

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

describe("deleteMatchNotificationsForSource", () => {
  it("deletes only MATCH_SUGGESTION notifications for the given source", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const db = { notification: { deleteMany } };
    await deleteMatchNotificationsForSource(db as never, "property", "prop-1");
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { type: "MATCH_SUGGESTION", relatedType: "Property", relatedId: "prop-1" },
    });
    await deleteMatchNotificationsForSource(db as never, "customer", "cust-1");
    expect(deleteMany).toHaveBeenLastCalledWith({
      where: { type: "MATCH_SUGGESTION", relatedType: "Customer", relatedId: "cust-1" },
    });
  });
});

describe("scorePair breakdown", () => {
  const fullCust = {
    preferredDealType: "SALE",
    preferredType: "APARTMENT",
    preferredArea: "x",
    preferredAreas: ["x"],
    preferredBeds: 2,
    preferredSizeMin: 90,
    preferredSizeMax: 120,
    budgetMin: null,
    budgetMax: BigInt(10_000_000_000),
    budgetMaxMonthly: null,
  };
  const fullProp = {
    dealType: "SALE",
    type: "APARTMENT",
    region: "x",
    salePriceToman: BigInt(10_000_000_000),
    depositToman: null,
    monthlyRentToman: null,
    sizeSqm: 100,
    beds: 2,
  };

  it("explains which criteria fit, with points summing to the score", () => {
    const r = scorePair(fullCust, fullProp)!;
    expect(r.score).toBe(100);
    const budget = r.breakdown.find((b) => b.key === "budget")!;
    expect(budget.fit).toBe("fit");
    expect(budget.score).toBe(100);
    expect(budget.points).toBe(60);
    expect(r.breakdown.find((b) => b.key === "size")!.points).toBe(25);
    expect(r.breakdown.find((b) => b.key === "beds")!.points).toBe(15);
    const area = r.breakdown.find((b) => b.key === "area")!;
    expect(area.fit).toBe("fit");
    expect(area.weight).toBe(0);
    expect(area.points).toBe(0);
    const pointsSum = r.breakdown.reduce((s, b) => s + b.points, 0);
    expect(pointsSum).toBe(r.score);
  });

  it("marks a far-off size as a miss that drags the score down", () => {
    const r = scorePair(fullCust, { ...fullProp, sizeSqm: 200 })!;
    const size = r.breakdown.find((b) => b.key === "size")!;
    expect(size.fit).toBe("miss");
    expect(size.score).toBe(0);
    expect(size.points).toBe(0);
    expect(r.score).toBe(75);
    const pointsSum = r.breakdown.reduce((s, b) => s + b.points, 0);
    expect(pointsSum).toBe(r.score);
  });

  it("marks unspecified criteria as na and excludes them from the score", () => {
    const r = scorePair(
      { ...fullCust, preferredBeds: null, preferredSizeMin: null, preferredSizeMax: null },
      fullProp
    )!;
    expect(r.score).toBe(100);
    expect(r.breakdown.find((b) => b.key === "size")!.fit).toBe("na");
    expect(r.breakdown.find((b) => b.key === "beds")!.fit).toBe("na");
    const budget = r.breakdown.find((b) => b.key === "budget")!;
    expect(budget.points).toBe(100);
  });
});
