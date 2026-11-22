import { describe, expect, it } from "vitest";
import { calcRentCommission, calcSaleCommission, calcVat, splitReceived } from "./commission";

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
  it("computes 25% of monthly rent plus 25% of three percent of the deposit", () => {
    // ودیعه ۱٫۲ میلیارد + اجاره ۵۰۰ هزار → مبنا ۳۶٬۵۰۰٬۰۰۰ → کمیسیون ۹٬۱۲۵٬۰۰۰
    expect(calcRentCommission(1_200_000_000, 500_000)).toBe(9_125_000);
    // رهن کامل ۱ میلیارد، بدون اجاره → مبنا ۳۰٬۰۰۰٬۰۰۰ → کمیسیون ۷٬۵۰۰٬۰۰۰
    expect(calcRentCommission(1_000_000_000, 0)).toBe(7_500_000);
  });

  it("returns 0 for invalid input", () => {
    expect(calcRentCommission(-1, 500_000)).toBe(0);
    expect(calcRentCommission(1_000_000, -1)).toBe(0);
  });
});

describe("splitReceived", () => {
  it("splits the received amount into 0.25% commission, 10% VAT on it, and the rest as shirini", () => {
    // قیمت ۵ میلیارد، دریافتی ۵۰ میلیون → کمیسیون ۱۲٬۵۰۰٬۰۰۰، مالیات ۱٬۲۵۰٬۰۰۰، شیرینی ۳۶٬۲۵۰٬۰۰۰
    expect(splitReceived(5_000_000_000, 50_000_000)).toEqual({ commission: 12_500_000, vat: 1_250_000, shirini: 36_250_000 });
    // قیمت ۱۱٫۵ میلیارد، دریافتی ۱۰۰ میلیون → کمیسیون ۲۸٬۷۵۰٬۰۰۰، مالیات ۲٬۸۷۵٬۰۰۰، شیرینی ۶۸٬۳۷۵٬۰۰۰
    expect(splitReceived(11_500_000_000, 100_000_000)).toEqual({ commission: 28_750_000, vat: 2_875_000, shirini: 68_375_000 });
  });

  it("clamps shirini at zero when the received amount is less than commission plus VAT", () => {
    expect(splitReceived(5_000_000_000, 10_000_000)).toEqual({ commission: 12_500_000, vat: 1_250_000, shirini: 0 });
    expect(splitReceived(0, 50_000_000)).toEqual({ commission: 0, vat: 0, shirini: 0 });
  });
});

describe("calcVat", () => {
  it("computes 10% VAT on the commission only", () => {
    expect(calcVat(28_750_000)).toBe(2_875_000);
    expect(calcVat(9_125_000)).toBe(912_500);
    expect(calcVat(0)).toBe(0);
  });
});
