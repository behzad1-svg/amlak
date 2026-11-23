import { describe, expect, it } from "vitest";
import {
  commissionAmountFor,
  dealSplittable,
  dealTaxBase,
  dealTotalCommission,
  dealTotalDiscount,
  dealTotalShirini,
  equalSplitPcts,
  resolveSplit,
  shareAmount,
  splitForViewer,
  validateCommissionAmount,
  validateSplitInput,
} from "./shares";

describe("shareAmount", () => {
  it("computes the share of a base", () => {
    expect(shareAmount(BigInt(10_000_000), 50)).toBe(BigInt(5_000_000));
    expect(shareAmount(BigInt(10_000_000), 0.25)).toBe(BigInt(25_000));
    expect(shareAmount(BigInt(10_000_000), 0)).toBe(BigInt(0));
  });

  it("rounds half up", () => {
    expect(shareAmount(BigInt(1_000_001), 50)).toBe(BigInt(500_001));
  });

  it("returns zero for a missing base", () => {
    expect(shareAmount(null, 50)).toBe(BigInt(0));
    expect(shareAmount(undefined, 50)).toBe(BigInt(0));
  });

  it("stays exact above 2^53 where Number would lose precision", () => {
    expect(shareAmount(BigInt("9007199254740993"), 50)).toBe(BigInt("4503599627370497"));
  });
});

describe("equalSplitPcts", () => {
  it("splits the advisors' share equally", () => {
    expect(equalSplitPcts(60, 2)).toEqual([20, 20]);
    expect(equalSplitPcts(50, 2)).toEqual([25, 25]);
    expect(equalSplitPcts(0, 1)).toEqual([100]);
    expect(equalSplitPcts(100, 2)).toEqual([0, 0]);
  });

  it("hands the leftover hundredths to the first shares so the total is exact", () => {
    const pcts = equalSplitPcts(50, 3);
    expect(pcts).toEqual([16.67, 16.67, 16.66]);
    expect(pcts.reduce((a, b) => a + b, 0)).toBeCloseTo(50, 10);
  });

  it("returns an empty list for zero shares", () => {
    expect(equalSplitPcts(50, 0)).toEqual([]);
  });
});

describe("dealTotalCommission", () => {
  it("sums both sides when per-side fields exist", () => {
    expect(
      dealTotalCommission({
        commissionToman: BigInt(57_500_000),
        sellerCommissionToman: BigInt(28_750_000),
        buyerCommissionToman: BigInt(28_750_000),
      }),
    ).toBe(BigInt(57_500_000));
  });

  it("falls back to the legacy single commission for old deals", () => {
    expect(dealTotalCommission({ commissionToman: BigInt(10_000_000) })).toBe(BigInt(10_000_000));
    expect(dealTotalCommission({ commissionToman: null })).toBe(BigInt(0));
  });
});

describe("dealTotalDiscount", () => {
  it("sums both sides' discounts", () => {
    expect(
      dealTotalDiscount({
        discountToman: null,
        sellerDiscountToman: BigInt(1_000_000),
        buyerDiscountToman: BigInt(2_000_000),
      }),
    ).toBe(BigInt(3_000_000));
  });

  it("falls back to the legacy single discount for old deals", () => {
    expect(dealTotalDiscount({ discountToman: BigInt(5_000_000) })).toBe(BigInt(5_000_000));
    expect(dealTotalDiscount({})).toBe(BigInt(0));
  });
});

describe("dealTotalShirini", () => {
  it("sums both sides' shirini", () => {
    expect(
      dealTotalShirini({ sellerShiriniToman: BigInt(18_375_000), buyerShiriniToman: BigInt(0) }),
    ).toBe(BigInt(18_375_000));
    expect(dealTotalShirini({})).toBe(BigInt(0));
  });
});

describe("dealSplittable", () => {
  it("is commission + both shirini minus discount", () => {
    expect(
      dealSplittable({
        commissionToman: BigInt(10_000_000),
        sellerShiriniToman: BigInt(1_000_000),
        buyerShiriniToman: BigInt(89_000_000),
        discountToman: null,
      }),
    ).toBe(BigInt(100_000_000));
  });

  it("discount reduces the split base", () => {
    expect(
      dealSplittable({
        commissionToman: BigInt(10_000_000),
        sellerShiriniToman: BigInt(1_000_000),
        buyerShiriniToman: BigInt(89_000_000),
        discountToman: BigInt(5_000_000),
      }),
    ).toBe(BigInt(95_000_000));
  });

  it("treats missing values as zero", () => {
    expect(dealSplittable({ commissionToman: null })).toBe(BigInt(0));
    expect(
      dealSplittable({ commissionToman: BigInt(10_000_000), sellerShiriniToman: null }),
    ).toBe(BigInt(10_000_000));
  });

  it("uses the two-sided totals: both commissions + both shirinis minus both discounts", () => {
    // معامله ۱۱٫۵ میلیارد: کمیسیون هر طرف ۲۸٬۷۵۰٬۰۰۰، شیرینی فروشنده ۱۸٬۳۷۵٬۰۰۰
    expect(
      dealSplittable({
        commissionToman: BigInt(57_500_000),
        sellerCommissionToman: BigInt(28_750_000),
        buyerCommissionToman: BigInt(28_750_000),
        sellerShiriniToman: BigInt(18_375_000),
        buyerShiriniToman: BigInt(0),
        sellerDiscountToman: null,
        buyerDiscountToman: null,
      }),
    ).toBe(BigInt(75_875_000));
  });

  it("subtracts the per-side discounts from the split base, never the VAT", () => {
    // تخفیف فروشنده ۱۱٬۶۲۵٬۰۰۰ (دریافتی ۲۰ میلیون) از مبنا کم می‌شود؛ مالیات جداگانه و کامل می‌ماند
    expect(
      dealSplittable({
        commissionToman: BigInt(57_500_000),
        sellerCommissionToman: BigInt(28_750_000),
        buyerCommissionToman: BigInt(28_750_000),
        sellerShiriniToman: BigInt(0),
        buyerShiriniToman: BigInt(0),
        sellerDiscountToman: BigInt(11_625_000),
        buyerDiscountToman: BigInt(0),
      }),
    ).toBe(BigInt(45_875_000));
  });
});

describe("dealTaxBase", () => {
  it("is the gross commission only — shirini is not taxed", () => {
    // 10% VAT on this base is 1,000,000; the 89,000,000 shirini never enters it.
    expect(dealTaxBase({ commissionToman: BigInt(10_000_000) })).toBe(BigInt(10_000_000));
    expect(dealTaxBase({ commissionToman: null })).toBe(BigInt(0));
  });

  it("is the total commission of both sides for two-sided deals", () => {
    expect(
      dealTaxBase({
        commissionToman: BigInt(57_500_000),
        sellerCommissionToman: BigInt(28_750_000),
        buyerCommissionToman: BigInt(28_750_000),
      }),
    ).toBe(BigInt(57_500_000));
  });
});

function dealWithShares() {
  return {
    commissionToman: BigInt(10_000_000),
    sellerShiriniToman: BigInt(1_000_000),
    buyerShiriniToman: BigInt(89_000_000),
    discountToman: null,
    commissionPaid: false,
    officePct: 50,
    agentId: "agent-1",
    agent: { id: "agent-1", name: "مشاور تست" },
    shares: [
      { id: "s1", userId: "u1", name: "علی", pct: 25, settled: false, settledAt: null },
      { id: "s2", userId: null, name: "تعاون", pct: 25, settled: true, settledAt: "2026-11-16" },
    ],
  };
}

function dealWithSides() {
  return {
    ...dealWithShares(),
    sellerCommissionToman: BigInt(6_000_000),
    buyerCommissionToman: BigInt(4_000_000),
    sellerDiscountToman: null,
    buyerDiscountToman: null,
  };
}

describe("resolveSplit", () => {
  it("resolves real shares with office and per-share amounts", () => {
    const split = resolveSplit(dealWithShares());
    expect(split.officePct).toBe(50);
    expect(split.officeAmount).toBe(BigInt(50_000_000));
    expect(split.shares).toHaveLength(2);
    expect(split.shares[0]).toMatchObject({
      id: "s1",
      userId: "u1",
      pct: 25,
      settled: false,
      isExternal: false,
      amount: BigInt(25_000_000),
      virtual: false,
    });
    expect(split.shares[1]).toMatchObject({
      id: "s2",
      userId: null,
      isExternal: true,
      amount: BigInt(25_000_000),
      virtual: false,
    });
  });

  it("treats a missing officePct as zero", () => {
    const split = resolveSplit({ ...dealWithShares(), officePct: null });
    expect(split.officePct).toBe(0);
    expect(split.officeAmount).toBe(BigInt(0));
  });

  it("gives deals without shares the stored office share and a virtual remainder share for the deal agent", () => {
    const split = resolveSplit({ ...dealWithShares(), shares: [] });
    expect(split.officePct).toBe(50);
    expect(split.officeAmount).toBe(BigInt(50_000_000));
    expect(split.shares).toHaveLength(1);
    expect(split.shares[0]).toMatchObject({
      id: null,
      userId: "agent-1",
      name: "مشاور تست",
      pct: 50,
      settled: false,
      isExternal: false,
      amount: BigInt(50_000_000),
      virtual: true,
    });
  });

  it("gives the office everything when a share-less deal stores officePct 100", () => {
    const split = resolveSplit({ ...dealWithShares(), shares: [], officePct: 100 });
    expect(split.officePct).toBe(100);
    expect(split.officeAmount).toBe(BigInt(100_000_000));
    expect(split.shares).toEqual([]);
  });

  it("scales the virtual share with the stored office share", () => {
    const split = resolveSplit({ ...dealWithShares(), shares: [], officePct: 25 });
    expect(split.officePct).toBe(25);
    expect(split.officeAmount).toBe(BigInt(25_000_000));
    expect(split.shares).toHaveLength(1);
    expect(split.shares[0]).toMatchObject({ pct: 75, amount: BigInt(75_000_000), virtual: true });
  });

  it("breaks each share into a commission part and a shirini part that sum to the share amount", () => {
    const split = resolveSplit(dealWithSides());
    // مبنا ۱۰۰٬۰۰۰٬۰۰۰ = کمیسیون ۱۰٬۰۰۰٬۰۰۰ (۶ + ۴ میلیون دو طرف) + شیرینی ۹۰٬۰۰۰٬۰۰۰
    expect(split.officeAmount).toBe(BigInt(50_000_000));
    expect(split.officeCommissionAmount).toBe(BigInt(5_000_000));
    expect(split.officeShiriniAmount).toBe(BigInt(45_000_000));
    expect(split.officeCommissionAmount! + split.officeShiriniAmount!).toBe(split.officeAmount);
    expect(split.shares[0]).toMatchObject({
      amount: BigInt(25_000_000),
      commissionAmount: BigInt(2_500_000),
      shiriniAmount: BigInt(22_500_000),
    });
    for (const share of split.shares) {
      expect(share.commissionAmount + share.shiriniAmount).toBe(share.amount);
    }
  });

  it("falls back to the legacy commission for the breakdown of old deals", () => {
    const split = resolveSplit(dealWithShares());
    expect(split.officeCommissionAmount).toBe(BigInt(5_000_000));
    expect(split.officeShiriniAmount).toBe(BigInt(45_000_000));
    expect(split.shares[0]).toMatchObject({
      commissionAmount: BigInt(2_500_000),
      shiriniAmount: BigInt(22_500_000),
    });
  });

  it("marks the virtual share settled when the deal commission is paid", () => {
    const split = resolveSplit({ ...dealWithShares(), shares: [], commissionPaid: true });
    expect(split.shares[0].settled).toBe(true);
  });

  it("falls back to a generic name when the agent record is missing", () => {
    const split = resolveSplit({ ...dealWithShares(), shares: [], agent: null });
    expect(split.shares[0].name).toBe("مشاور معامله");
  });

  it("returns no shares for a zero base without real shares", () => {
    const split = resolveSplit({
      ...dealWithShares(),
      shares: [],
      commissionToman: null,
      sellerShiriniToman: null,
      buyerShiriniToman: null,
    });
    expect(split).toEqual({
      officePct: 0,
      officeAmount: BigInt(0),
      officeCommissionAmount: BigInt(0),
      officeShiriniAmount: BigInt(0),
      shares: [],
    });
  });
});

describe("splitForViewer", () => {
  it("shows everything to the owner", () => {
    const split = resolveSplit(dealWithShares());
    expect(splitForViewer(split, "u1", true)).toBe(split);
  });

  it("shows an advisor only their own share and hides the office share", () => {
    const split = resolveSplit(dealWithShares());
    const view = splitForViewer(split, "u1", false);
    expect(view.officePct).toBeNull();
    expect(view.officeAmount).toBeNull();
    expect(view.shares).toHaveLength(1);
    expect(view.shares[0].userId).toBe("u1");
  });

  it("shows no shares to an advisor with no share", () => {
    const split = resolveSplit(dealWithShares());
    expect(splitForViewer(split, "uX", false).shares).toEqual([]);
  });
});

describe("validateSplitInput", () => {
  it("accepts a split that totals exactly 100%", () => {
    expect(
      validateSplitInput(50, [
        { userId: "u1", pct: 25 },
        { userId: "u2", pct: 25 },
      ]),
    ).toBeNull();
    expect(validateSplitInput(100, [])).toBeNull();
  });

  it("rejects an office share outside 0–100", () => {
    expect(validateSplitInput(101, [])).toBe("سهم دفتر باید بین ۰ تا ۱۰۰ باشد");
    expect(validateSplitInput(-1, [])).toBe("سهم دفتر باید بین ۰ تا ۱۰۰ باشد");
    expect(validateSplitInput(NaN, [])).toBe("سهم دفتر باید بین ۰ تا ۱۰۰ باشد");
  });

  it("rejects an office share under 100% with no shares", () => {
    expect(validateSplitInput(50, [])).toBe("مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود");
  });

  it("rejects a share percent of zero or over 100", () => {
    expect(validateSplitInput(50, [{ userId: "u1", pct: 0 }])).toBe(
      "درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد",
    );
    expect(validateSplitInput(50, [{ userId: "u1", pct: 101 }])).toBe(
      "درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد",
    );
  });

  it("rejects the same advisor twice", () => {
    expect(
      validateSplitInput(50, [
        { userId: "u1", pct: 25 },
        { userId: "u1", pct: 25 },
      ]),
    ).toBe("یک مشاور نمی‌تواند دو سهم در یک معامله داشته باشد");
  });

  it("requires an external share to have a name", () => {
    expect(validateSplitInput(75, [{ userId: null, name: "", pct: 25 }])).toBe(
      "هر سهم باید مشاور یا نام همکار بیرونی داشته باشد",
    );
    expect(validateSplitInput(75, [{ userId: null, name: "تعاون", pct: 25 }])).toBeNull();
  });

  it("reports the actual total in Persian digits when it is not 100%", () => {
    expect(
      validateSplitInput(50, [
        { userId: "u1", pct: 25 },
        { userId: "u2", pct: 24 },
      ]),
    ).toBe("مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (الان ۹۹٪ است)");
  });

  it("accepts totals within the 0.01 tolerance", () => {
    expect(
      validateSplitInput(50, [
        { userId: "u1", pct: 25 },
        { userId: "u2", pct: 24.995 },
      ]),
    ).toBeNull();
  });
});

describe("commissionAmountFor", () => {
  it("computes price x percent with the same half-up rounding as shareAmount", () => {
    expect(commissionAmountFor(BigInt(10_000_000_000), 1)).toBe(BigInt(100_000_000));
    expect(commissionAmountFor(BigInt(12_000_000_000), 1)).toBe(BigInt(120_000_000));
    expect(commissionAmountFor(BigInt(4_000_000_000), 0.25)).toBe(BigInt(10_000_000));
    expect(commissionAmountFor(BigInt(5_000_000_000), 1)).toBe(BigInt(50_000_000));
  });

  it("rounds half up on fractional tomans", () => {
    expect(commissionAmountFor(BigInt(999), 50)).toBe(BigInt(500));
    expect(commissionAmountFor(BigInt(1_000_001), 50)).toBe(BigInt(500_001));
  });

  it("matches the browser calcCommissionAmount (Math.round) for real deals", () => {
    // مرورگر: Math.round((price * percent) / 100)
    for (const [price, pct] of [
      [10_000_000_000, 1],
      [4_000_000_000, 0.25],
      [7_850_000_000, 1.5],
      [3_250_000_000, 0.75],
    ] as const) {
      expect(commissionAmountFor(BigInt(price), pct)).toBe(BigInt(Math.round((price * pct) / 100)));
    }
  });
});

describe("validateCommissionAmount", () => {
  it("accepts a matching amount/percent pair", () => {
    expect(validateCommissionAmount(BigInt(10_000_000_000), 1, BigInt(100_000_000))).toBeNull();
    expect(validateCommissionAmount(BigInt(4_000_000_000), 0.25, BigInt(10_000_000))).toBeNull();
  });

  it("rejects the F-0022 mismatch (1% of 10bn is 100m, not 120m)", () => {
    const error = validateCommissionAmount(BigInt(10_000_000_000), 1, BigInt(120_000_000));
    expect(error).toContain("مبلغ کمیسیون با درصدش نمی‌خواند");
    expect(error).toContain("۱۰۰۰۰۰۰۰۰");
  });

  it("accepts a difference within rounding tolerance", () => {
    expect(validateCommissionAmount(BigInt(10_000_000_000), 1, BigInt(100_000_100))).toBeNull();
  });

  it("rejects a difference beyond rounding tolerance", () => {
    expect(validateCommissionAmount(BigInt(10_000_000_000), 1, BigInt(100_000_101))).not.toBeNull();
  });

  it("skips the check when any of price/percent/amount is missing (تعیین نشده)", () => {
    expect(validateCommissionAmount(null, 1, BigInt(100_000_000))).toBeNull();
    expect(validateCommissionAmount(BigInt(10_000_000_000), null, BigInt(100_000_000))).toBeNull();
    expect(validateCommissionAmount(BigInt(10_000_000_000), undefined, BigInt(100_000_000))).toBeNull();
    expect(validateCommissionAmount(BigInt(10_000_000_000), 1, null)).toBeNull();
  });
});
