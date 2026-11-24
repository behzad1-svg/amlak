import { describe, expect, it } from "vitest";
import {
  compareJalali,
  formatJalali,
  formatJalaliDateTime,
  formatJalaliDayMonth,
  formatJalaliShort,
  formatTehranTime,
  getJalaliDaysInMonth,
  getTodayJalali,
  isPastJalaliDate,
  isToday,
  isValidJalaliDate,
  jalaliToGregorian,
  tehranDayBounds,
  tehranDayBoundsOffset,
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

describe("isToday", () => {
  // ظهر روز جاری تهران؛ با جابه‌جایی ۲۴ ساعته دیروز/فردا ساخته می‌شود تا
  // مرز ماه و اختلاف منطقهٔ زمانی اجراکنندهٔ تست دردسر نشود.
  function noonToday(): Date {
    const t = getTodayJalali();
    const d = jalaliToGregorian(t.jy, t.jm, t.jd);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  it("امروز تهران را امروز می‌داند", () => {
    expect(isToday(noonToday().toISOString())).toBe(true);
  });

  it("دیروز و فردا امروز نیستند", () => {
    const d = noonToday();
    expect(isToday(new Date(d.getTime() - 86_400_000).toISOString())).toBe(false);
    expect(isToday(new Date(d.getTime() + 86_400_000).toISOString())).toBe(false);
  });

  it("مقدار خالی امروز نیست", () => {
    expect(isToday(null)).toBe(false);
    expect(isToday(undefined)).toBe(false);
    expect(isToday("")).toBe(false);
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

describe("tehranDayBoundsOffset", () => {
  it("tomorrow starts at Tehran midnight after today", () => {
    // 2026-11-21 07:00 UTC = 10:30 Tehran, Sat 30 Aban
    const now = new Date("2026-11-21T07:00:00Z");
    const { start, end } = tehranDayBoundsOffset(now, 1);
    expect(start.toISOString()).toBe("2026-11-21T20:30:00.000Z"); // 00:00 Tehran, 1 Azar
    expect(end.toISOString()).toBe("2026-11-22T20:29:59.999Z");
  });

  it("day after tomorrow is 2 Azar", () => {
    const now = new Date("2026-11-21T07:00:00Z");
    const { start, end } = tehranDayBoundsOffset(now, 2);
    expect(start.toISOString()).toBe("2026-11-22T20:30:00.000Z"); // 00:00 Tehran, 2 Azar
    expect(end.toISOString()).toBe("2026-11-23T20:29:59.999Z");
  });

  it("offset 0 is the same as today", () => {
    const now = new Date("2026-11-21T07:00:00Z");
    const a = tehranDayBoundsOffset(now, 0);
    const b = tehranDayBounds(now);
    expect(a.start.toISOString()).toBe(b.start.toISOString());
    expect(a.end.toISOString()).toBe(b.end.toISOString());
  });

  it("a morning viewing tomorrow falls inside the tomorrow window only", () => {
    const now = new Date("2026-11-21T07:00:00Z");
    const tomorrow = tehranDayBoundsOffset(now, 1);
    const today = tehranDayBounds(now);
    const viewing = new Date("2026-11-22T00:00:00Z"); // 03:30 Tehran, 1 Azar
    expect(viewing.getTime()).toBeGreaterThanOrEqual(tomorrow.start.getTime());
    expect(viewing.getTime()).toBeLessThanOrEqual(tomorrow.end.getTime());
    expect(viewing.getTime()).toBeGreaterThan(today.end.getTime());
  });

  it("a follow-up due earlier today is still inside today's window (F2)", () => {
    // 2026-11-21 11:30 UTC = 15:00 Tehran, Sat 30 Aban — the follow-up
    // was due at 08:30 Tehran, i.e. BEFORE now, but still today.
    const now = new Date("2026-11-21T11:30:00Z");
    const today = tehranDayBoundsOffset(now, 0);
    const followUp = new Date("2026-11-21T05:00:00Z"); // 08:30 Tehran
    expect(followUp.getTime()).toBeGreaterThanOrEqual(today.start.getTime());
    expect(followUp.getTime()).toBeLessThanOrEqual(today.end.getTime());
  });
});

describe("formatJalaliDayMonth", () => {
  it("formats day and month without year", () => {
    expect(formatJalaliDayMonth(new Date(2026, 10, 22))).toBe("۱ آذر");
    expect(formatJalaliDayMonth(new Date(2026, 10, 16))).toBe("۲۵ آبان");
  });

  it("returns a dash for missing input", () => {
    expect(formatJalaliDayMonth(null)).toBe("—");
  });
});

describe("formatTehranTime", () => {
  it("formats Tehran time with Persian digits", () => {
    // 2026-11-24T11:41:00Z = 15:11 Tehran (UTC+3:30, no DST)
    expect(formatTehranTime(new Date("2026-11-24T11:41:00Z"))).toBe("۱۵:۱۱");
    // midnight renders 00:00, not 24:00
    expect(formatTehranTime(new Date("2026-11-24T20:30:00Z"))).toBe("۰۰:۰۰");
  });
});
