import { jalaliToGregorian } from "./jalali";

// Official public holidays of Iran, from the official calendar
// (Calendar Center of the Geophysics Institute, University of Tehran),
// the same source time.ir displays. Lunar (Hijri) dates are fixed by
// moon sighting, so they cannot be derived from the tabular Islamic
// calendar reliably: that conversion is off by one day for several
// months of 1405 (e.g. Tasua is 3 Tir, not 4 Tir) and for 11 Aban 1406.
// The dates below are therefore the published official dates for 1405
// (26 days, 3 of them Friday) and 1406 (27 days, 4 of them Friday),
// cross-checked against time.ir's live calendar for Aban 1405
// (holidays: 1, 8, 15, 22, 29). Years outside this table still mark
// Fridays as holidays; official dates for later years are added when
// the next official calendar is published.
const OFFICIAL_HOLIDAYS: Record<number, Record<number, readonly number[]>> = {
  1405: {
    1: [1, 2, 3, 4, 12, 13, 25],
    3: [6, 14, 15],
    4: [3, 4],
    5: [13, 21, 22, 30],
    6: [8],
    8: [22],
    10: [2, 16],
    11: [4, 22],
    12: [9, 19, 20, 29],
  },
  1406: {
    1: [1, 2, 3, 4, 12, 13, 14],
    2: [27],
    3: [4, 14, 15, 24, 25],
    5: [3, 11, 12, 20, 29],
    8: [11],
    9: [21],
    10: [5, 23],
    11: [22, 28],
    12: [8, 9, 29],
  },
};

export function isFriday(jy: number, jm: number, jd: number): boolean {
  return jalaliToGregorian(jy, jm, jd).getDay() === 5;
}

export function isJalaliHoliday(jy: number, jm: number, jd: number): boolean {
  if (isFriday(jy, jm, jd)) return true;
  const year = OFFICIAL_HOLIDAYS[jy];
  if (!year) return false;
  const days = year[jm];
  return days ? days.includes(jd) : false;
}
