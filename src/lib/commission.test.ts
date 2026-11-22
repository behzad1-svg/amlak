import { describe, expect, it } from "vitest";
import { calcRentCommission, calcSaleCommission, calcVat } from "./commission";

describe("calcSaleCommission", () => {
  it("computes 0.25% of the sale price (the Sangi villa case)", () => {
    expect(calcSaleCommission(11_500_000_000, 0.25)).toBe(28_750_000);
  });

  it("returns 0 for invalid input", () => {
    expect(calcSaleCommission(0, 0.25)).toBe(0);
    expect(calcSaleCommission(-100, 0.25)).toBe(0);
    expect(calcSaleCommission(1_000_000, 101)).toBe(0);
  });
});

describe("calcRentCommission", () => {
  it("computes 25% of monthly rent plus 25% of one percent of the deposit", () => {
    // ودیعه ۱٫۲ میلیارد + اجاره ۵۰۰ هزار → مبنا ۱۲٬۵۰۰٬۰۰۰ → کمیسیون ۳٬۱۲۵٬۰۰۰
    expect(calcRentCommission(1_200_000_000, 500_000)).toBe(3_125_000);
    // رهن کامل ۱ میلیارد، بدون اجاره → مبنا ۱۰٬۰۰۰٬۰۰۰ → کمیسیون ۲٬۵۰۰٬۰۰۰
    expect(calcRentCommission(1_000_000_000, 0)).toBe(2_500_000);
  });

  it("returns 0 for invalid input", () => {
    expect(calcRentCommission(-1, 500_000)).toBe(0);
    expect(calcRentCommission(1_000_000, -1)).toBe(0);
  });
});

describe("calcVat", () => {
  it("computes 10% VAT on the commission only", () => {
    expect(calcVat(28_750_000)).toBe(2_875_000);
    expect(calcVat(3_125_000)).toBe(312_500);
    expect(calcVat(0)).toBe(0);
  });
});
