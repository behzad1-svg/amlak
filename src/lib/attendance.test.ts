import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  isWorkingDay,
  parseHHMM,
  resolveSession,
  tehranDateOnly,
  tehranParts,
  type AttendanceSettings,
} from "./attendance";

const SETTINGS: AttendanceSettings = {
  officeLat: 28.96246,
  officeLng: 50.838971,
  radiusM: 100,
  morningStart: "09:00",
  morningEnd: "13:00",
  eveningStart: "17:00",
  eveningEnd: "21:00",
  fridayOff: true,
};

// تهران UTC+3:30 است؛ این لحظه‌ها به وقت تهران نوشته شده‌اند.
const atTehran = (isoTehranWall: string) => {
  // ورودی «YYYY-MM-DDTHH:mm» به وقت تهران → لحظهٔ UTC متناظر
  const [d, t] = isoTehranWall.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, da, h - 3, mi - 30));
};

describe("haversineMeters", () => {
  it("same point is zero", () => {
    expect(haversineMeters(28.96246, 50.838971, 28.96246, 50.838971)).toBe(0);
  });
  it("100 metres north of the office is ~100 m", () => {
    // یک درجه عرض جغرافیایی ≈ ۱۱۱٬۳۲۰ متر
    const d = haversineMeters(28.96246, 50.838971, 28.96246 + 100 / 111320, 50.838971);
    expect(d).toBeGreaterThan(95);
    expect(d).toBeLessThan(105);
  });
  it("1 km east of the office is ~1000 m", () => {
    const d = haversineMeters(28.96246, 50.838971, 28.96246, 50.838971 + 1000 / (111320 * Math.cos((28.96246 * Math.PI) / 180)));
    expect(d).toBeGreaterThan(950);
    expect(d).toBeLessThan(1050);
  });
  it("a point 150 m away is outside the 100 m radius", () => {
    const d = haversineMeters(28.96246, 50.838971, 28.96246 + 150 / 111320, 50.838971);
    expect(d).toBeGreaterThan(SETTINGS.radiusM);
  });
});

describe("tehranParts / tehranDateOnly", () => {
  it("23:30 Tehran on 2 Azar is still 2 Azar", () => {
    // 2026-11-23 23:30 تهران = 20:00 UTC همان روز
    const now = new Date(Date.UTC(2026, 10, 23, 20, 0));
    const p = tehranParts(now);
    expect(p.gy).toBe(2026);
    expect(p.gm).toBe(11);
    expect(p.gd).toBe(23);
    expect(p.hour).toBe(23);
    expect(p.minute).toBe(30);
    expect(tehranDateOnly(now).toISOString()).toBe("2026-11-23T00:00:00.000Z");
  });
  it("00:30 Tehran is the next Gregorian day", () => {
    // 2026-11-24 00:30 تهران = 21:00 UTC روز ۲۳
    const now = new Date(Date.UTC(2026, 10, 23, 21, 0));
    const p = tehranParts(now);
    expect(p.gd).toBe(24);
    expect(p.hour).toBe(0);
    expect(p.minute).toBe(30);
    expect(tehranDateOnly(now).toISOString()).toBe("2026-11-24T00:00:00.000Z");
  });
});

describe("resolveSession", () => {
  it("09:02 is MORNING, 2 minutes late", () => {
    expect(resolveSession(atTehran("2026-11-23T09:02"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 2 });
  });
  it("08:45 is MORNING, on time (early window)", () => {
    expect(resolveSession(atTehran("2026-11-23T08:45"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
  });
  it("08:00 is the earliest MORNING check-in (60 min early)", () => {
    expect(resolveSession(atTehran("2026-11-23T08:00"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
  });
  it("07:59 is too early", () => {
    const r = resolveSession(atTehran("2026-11-23T07:59"), SETTINGS);
    expect(r.session).toBeNull();
  });
  it("13:00 is still MORNING, 240 minutes late", () => {
    expect(resolveSession(atTehran("2026-11-23T13:00"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 240 });
  });
  it("14:00 is between sessions", () => {
    const r = resolveSession(atTehran("2026-11-23T14:00"), SETTINGS);
    expect(r.session).toBeNull();
  });
  it("16:00 is the earliest EVENING check-in", () => {
    expect(resolveSession(atTehran("2026-11-23T16:00"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 0 });
  });
  it("17:30 is EVENING, 30 minutes late", () => {
    expect(resolveSession(atTehran("2026-11-23T17:30"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 30 });
  });
  it("21:00 is still EVENING", () => {
    expect(resolveSession(atTehran("2026-11-23T21:00"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 240 });
  });
  it("21:01 is past the day", () => {
    const r = resolveSession(atTehran("2026-11-23T21:01"), SETTINGS);
    expect(r.session).toBeNull();
  });
});

describe("isWorkingDay", () => {
  it("Friday 6 Azar 1405 is not a working day", () => {
    // ۶ آذر ۱۴۰۵ جمعه است (۲۷ نوامبر ۲۰۲۶)
    expect(isWorkingDay({ jy: 1405, jm: 9, jd: 6 }, SETTINGS)).toBe(false);
  });
  it("Saturday 7 Azar 1405 is a working day", () => {
    expect(isWorkingDay({ jy: 1405, jm: 9, jd: 7 }, SETTINGS)).toBe(true);
  });
  it("Friday is working when fridayOff is false", () => {
    expect(isWorkingDay({ jy: 1405, jm: 9, jd: 6 }, { ...SETTINGS, fridayOff: false })).toBe(true);
  });
});

describe("parseHHMM", () => {
  it("parses valid times", () => {
    expect(parseHHMM("09:00")).toBe(540);
    expect(parseHHMM("21:30")).toBe(1290);
  });
  it("rejects invalid times", () => {
    expect(parseHHMM("9:00")).toBeNull();
    expect(parseHHMM("24:00")).toBeNull();
    expect(parseHHMM("ab:cd")).toBeNull();
  });
});
