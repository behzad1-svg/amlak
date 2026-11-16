import { describe, expect, it } from "vitest";
import { formatTomanWithWords, toPersianTomanWords } from "./money";

describe("formatTomanWithWords", () => {
  it("returns a dash for null, undefined and empty input", () => {
    expect(formatTomanWithWords(null)).toEqual({ formatted: "—", words: "" });
    expect(formatTomanWithWords(undefined)).toEqual({ formatted: "—", words: "" });
    expect(formatTomanWithWords("")).toEqual({ formatted: "—", words: "" });
  });

  it("returns zero without words", () => {
    expect(formatTomanWithWords(0)).toEqual({ formatted: "۰ تومان", words: "" });
    expect(formatTomanWithWords("0")).toEqual({ formatted: "۰ تومان", words: "" });
  });

  it("formats millions", () => {
    expect(formatTomanWithWords(1_000_000)).toEqual({
      formatted: "۱,۰۰۰,۰۰۰ تومان",
      words: "۱ میلیون تومان",
    });
    expect(formatTomanWithWords(10_000_000)).toEqual({
      formatted: "۱۰,۰۰۰,۰۰۰ تومان",
      words: "۱۰ میلیون تومان",
    });
  });

  it("formats billions with a millions remainder", () => {
    expect(formatTomanWithWords(4_000_000_000)).toEqual({
      formatted: "۴,۰۰۰,۰۰۰,۰۰۰ تومان",
      words: "۴ میلیارد تومان",
    });
    expect(formatTomanWithWords(19_575_000_000)).toEqual({
      formatted: "۱۹,۵۷۵,۰۰۰,۰۰۰ تومان",
      words: "۱۹ میلیارد و ۵۷۵ میلیون تومان",
    });
    expect(formatTomanWithWords(2_500_000_000)).toEqual({
      formatted: "۲,۵۰۰,۰۰۰,۰۰۰ تومان",
      words: "۲ میلیارد و ۵۰۰ میلیون تومان",
    });
  });

  it("drops the sub-million remainder in words", () => {
    expect(formatTomanWithWords(1_500_000).words).toBe("۱ میلیون تومان");
    expect(formatTomanWithWords(500_000).words).toBe("۵۰۰,۰۰۰ تومان");
    expect(formatTomanWithWords(999_999).words).toBe("۹۹۹,۹۹۹ تومان");
  });

  it("accepts string and bigint input", () => {
    expect(formatTomanWithWords("1000000")).toEqual(formatTomanWithWords(1_000_000));
    expect(formatTomanWithWords(BigInt(1_000_000))).toEqual(formatTomanWithWords(1_000_000));
    expect(formatTomanWithWords("1,000,000")).toEqual(formatTomanWithWords(1_000_000));
  });
});

describe("toPersianTomanWords", () => {
  it("returns only the words part", () => {
    expect(toPersianTomanWords(10_000_000)).toBe("۱۰ میلیون تومان");
    expect(toPersianTomanWords(null)).toBe("");
  });
});
