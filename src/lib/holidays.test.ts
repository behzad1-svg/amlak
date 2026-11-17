import { describe, expect, it } from "vitest";
import { isFriday, isJalaliHoliday } from "./holidays";

describe("isFriday", () => {
  it("detects Fridays from the Jalali date", () => {
    // 22 Aban 1405 is a Friday (verified against time.ir)
    expect(isFriday(1405, 8, 22)).toBe(true);
    expect(isFriday(1405, 8, 23)).toBe(false);
    expect(isFriday(1405, 8, 1)).toBe(true);
    expect(isFriday(1406, 1, 1)).toBe(false);
  });
});

describe("isJalaliHoliday", () => {
  it("marks every Friday as a holiday, even outside the dataset years", () => {
    expect(isJalaliHoliday(1405, 8, 1)).toBe(true);
    expect(isJalaliHoliday(1405, 8, 8)).toBe(true);
    expect(isJalaliHoliday(1405, 8, 15)).toBe(true);
    expect(isJalaliHoliday(1405, 8, 29)).toBe(true);
    // 1 Farvardin 1407 is a Monday, 5 Farvardin is the first Friday
    expect(isJalaliHoliday(1407, 1, 5)).toBe(true);
    expect(isJalaliHoliday(1407, 1, 1)).toBe(false);
  });

  it("marks the official 1405 holidays", () => {
    expect(isJalaliHoliday(1405, 1, 1)).toBe(true); // Nowruz + Eid al-Fitr
    expect(isJalaliHoliday(1405, 1, 12)).toBe(true); // Islamic Republic Day
    expect(isJalaliHoliday(1405, 1, 13)).toBe(true); // Nature Day
    // 25 Farvardin, not 24: the tabular Islamic conversion is a day off
    expect(isJalaliHoliday(1405, 1, 25)).toBe(true);
    expect(isJalaliHoliday(1405, 1, 24)).toBe(false);
    expect(isJalaliHoliday(1405, 3, 6)).toBe(true); // Eid al-Adha
    expect(isJalaliHoliday(1405, 3, 14)).toBe(true); // Ghadir + Khomeini
    expect(isJalaliHoliday(1405, 4, 3)).toBe(true); // Tasua, not 4 Tir
    expect(isJalaliHoliday(1405, 4, 4)).toBe(true); // Ashura
    expect(isJalaliHoliday(1405, 5, 13)).toBe(true); // Arbaeen
    expect(isJalaliHoliday(1405, 5, 30)).toBe(true); // Imam Hassan Askari
    expect(isJalaliHoliday(1405, 6, 8)).toBe(true); // Prophet's birthday
    expect(isJalaliHoliday(1405, 8, 22)).toBe(true); // Fatima's martyrdom
    expect(isJalaliHoliday(1405, 10, 2)).toBe(true); // Imam Ali's birthday
    expect(isJalaliHoliday(1405, 10, 16)).toBe(true); // Maba'ath
    expect(isJalaliHoliday(1405, 11, 4)).toBe(true); // Imam Mahdi's birthday
    expect(isJalaliHoliday(1405, 11, 22)).toBe(true); // Revolution Day
    expect(isJalaliHoliday(1405, 12, 9)).toBe(true); // Imam Ali's martyrdom
    expect(isJalaliHoliday(1405, 12, 19)).toBe(true); // Eid al-Fitr
    expect(isJalaliHoliday(1405, 12, 20)).toBe(true);
    expect(isJalaliHoliday(1405, 12, 29)).toBe(true); // Oil nationalization
  });

  it("marks the official 1406 holidays", () => {
    expect(isJalaliHoliday(1406, 1, 1)).toBe(true);
    expect(isJalaliHoliday(1406, 1, 14)).toBe(true); // Imam Sadiq's martyrdom
    expect(isJalaliHoliday(1406, 2, 27)).toBe(true); // Eid al-Adha
    expect(isJalaliHoliday(1406, 3, 24)).toBe(true); // Tasua
    expect(isJalaliHoliday(1406, 3, 25)).toBe(true); // Ashura
    expect(isJalaliHoliday(1406, 5, 29)).toBe(true); // Prophet's birthday
    // 11 Aban, not 12: the tabular Islamic conversion is a day off
    expect(isJalaliHoliday(1406, 8, 11)).toBe(true);
    expect(isJalaliHoliday(1406, 8, 12)).toBe(false);
    expect(isJalaliHoliday(1406, 9, 21)).toBe(true); // Imam Ali's birthday
    expect(isJalaliHoliday(1406, 10, 23)).toBe(true); // Imam Mahdi's birthday
    expect(isJalaliHoliday(1406, 11, 22)).toBe(true); // Revolution Day
    expect(isJalaliHoliday(1406, 12, 8)).toBe(true); // Eid al-Fitr
    expect(isJalaliHoliday(1406, 12, 29)).toBe(true); // Oil nationalization
  });

  it("does not mark ordinary days", () => {
    expect(isJalaliHoliday(1405, 8, 23)).toBe(false);
    expect(isJalaliHoliday(1405, 2, 15)).toBe(false);
    expect(isJalaliHoliday(1405, 7, 11)).toBe(false);
    expect(isJalaliHoliday(1406, 7, 10)).toBe(false);
    expect(isJalaliHoliday(1406, 4, 10)).toBe(false);
  });
});
