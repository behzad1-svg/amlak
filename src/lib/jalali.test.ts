import { describe, expect, it } from "vitest";
import {
  compareJalali,
  formatJalali,
  formatJalaliDateTime,
  formatJalaliShort,
  getJalaliDaysInMonth,
  getTodayJalali,
  isPastJalaliDate,
  isValidJalaliDate,
  jalaliToGregorian,
  toJalali,
  toPersianDigits,
} from "./jalali";

describe("toPersianDigits", () => {
  it("converts Latin digits to Persian digits", () => {
    expect(toPersianDigits("0123456789")).toBe("۰۱۲۳۴۵۶۷۸۹");
    expect(toPersianDigits("abc 123")).toBe("abc ۱۲۳");
    expect(toPersianDigits("")).toBe("");
  });
});

describe("toJalali", () => {
  it("converts known Gregorian dates", () => {
    expect(toJalali(new Date(2026, 10, 16))).toEqual({ jy: 1405, jm: 8, jd: 25 });
    expect(toJalali(new Date(2026, 2, 21))).toEqual({ jy: 1405, jm: 1, jd: 1 });
    expect(toJalali(new Date(2026, 0, 1))).toEqual({ jy: 1404, jm: 10, jd: 11 });
  });

  it("accepts an ISO string", () => {
    expect(toJalali("2026-11-16T12:00:00Z")).toEqual({ jy: 1405, jm: 8, jd: 25 });
  });

  it("returns null for missing input", () => {
    expect(toJalali(null)).toBeNull();
    expect(toJalali(undefined)).toBeNull();
  });
});

describe("formatJalali", () => {
  it("formats with Persian month names and digits", () => {
    expect(formatJalali(new Date(2026, 10, 16))).toBe("۲۵ آبان ۱۴۰۵");
    expect(formatJalali(new Date(2026, 2, 21))).toBe("۱ فروردین ۱۴۰۵");
  });

  it("formats with Latin digits when asked", () => {
    expect(formatJalali(new Date(2026, 10, 16), false)).toBe("25 آبان 1405");
  });

  it("returns a dash for missing input", () => {
    expect(formatJalali(null)).toBe("—");
    expect(formatJalali(undefined)).toBe("—");
  });
});

describe("formatJalaliShort", () => {
  it("formats as YYYY/MM/DD with Persian digits and padding", () => {
    expect(formatJalaliShort(new Date(2026, 10, 16))).toBe("۱۴۰۵/۰۸/۲۵");
    expect(formatJalaliShort(new Date(2026, 2, 21))).toBe("۱۴۰۵/۰۱/۰۱");
    expect(formatJalaliShort(null)).toBe("—");
  });
});

describe("formatJalaliDateTime", () => {
  it("formats date and time", () => {
    expect(formatJalaliDateTime(new Date(2026, 10, 16, 14, 30))).toBe("۱۴۰۵/۰۸/۲۵ ۱۴:۳۰");
    expect(formatJalaliDateTime(null)).toBe("—");
  });
});

describe("jalaliToGregorian", () => {
  it("converts known Jalali dates", () => {
    const d = jalaliToGregorian(1405, 8, 25);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(10);
    expect(d.getDate()).toBe(16);
  });

  it("round-trips through toJalali", () => {
    for (const [jy, jm, jd] of [
      [1405, 1, 1],
      [1405, 6, 31],
      [1405, 8, 25],
      [1404, 10, 11],
    ] as const) {
      expect(toJalali(jalaliToGregorian(jy, jm, jd))).toEqual({ jy, jm, jd });
    }
  });
});

describe("getJalaliDaysInMonth", () => {
  it("returns 31 for the first six months, 30 for the next five, 29 for Esfand 1405", () => {
    expect(getJalaliDaysInMonth(1405, 6)).toBe(31);
    expect(getJalaliDaysInMonth(1405, 7)).toBe(30);
    expect(getJalaliDaysInMonth(1405, 12)).toBe(29);
  });
});

describe("isValidJalaliDate", () => {
  it("accepts valid dates and rejects invalid ones", () => {
    expect(isValidJalaliDate(1405, 8, 25)).toBe(true);
    expect(isValidJalaliDate(1405, 6, 31)).toBe(true);
    expect(isValidJalaliDate(1405, 7, 31)).toBe(false);
    expect(isValidJalaliDate(1405, 12, 30)).toBe(false);
    expect(isValidJalaliDate(1405, 13, 1)).toBe(false);
  });
});
describe("getTodayJalali", () => {
  it("returns the Tehran Jalali date for a fixed instant", () => {
    expect(getTodayJalali(new Date("2026-11-21T06:30:00Z"))).toEqual({ jy: 1405, jm: 8, jd: 30 });
  });

  it("stays on the same Jalali day just after midnight Tehran time", () => {
    expect(getTodayJalali(new Date("2026-11-20T21:00:00Z"))).toEqual({ jy: 1405, jm: 8, jd: 30 });
  });

  it("is still the previous Jalali day just before midnight Tehran time", () => {
    expect(getTodayJalali(new Date("2026-11-20T20:00:00Z"))).toEqual({ jy: 1405, jm: 8, jd: 29 });
  });

  it("converts Nowruz correctly", () => {
    expect(getTodayJalali(new Date("2026-03-21T00:00:00Z"))).toEqual({ jy: 1405, jm: 1, jd: 1 });
  });
});

describe("compareJalali", () => {
  it("orders by year, then month, then day", () => {
    expect(compareJalali({ jy: 1405, jm: 8, jd: 30 }, { jy: 1405, jm: 8, jd: 30 })).toBe(0);
    expect(compareJalali({ jy: 1405, jm: 8, jd: 29 }, { jy: 1405, jm: 8, jd: 30 })).toBeLessThan(0);
    expect(compareJalali({ jy: 1405, jm: 9, jd: 1 }, { jy: 1405, jm: 8, jd: 30 })).toBeGreaterThan(0);
    expect(compareJalali({ jy: 1404, jm: 12, jd: 29 }, { jy: 1405, jm: 1, jd: 1 })).toBeLessThan(0);
  });
});

describe("isPastJalaliDate", () => {
  const today = { jy: 1405, jm: 8, jd: 30 };
  it("is true for yesterday and earlier, false for today and later", () => {
    expect(isPastJalaliDate(1405, 8, 29, today)).toBe(true);
    expect(isPastJalaliDate(1405, 7, 30, today)).toBe(true);
    expect(isPastJalaliDate(1405, 8, 30, today)).toBe(false);
    expect(isPastJalaliDate(1405, 9, 1, today)).toBe(false);
  });
});
