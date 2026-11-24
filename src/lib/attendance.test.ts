import { describe, expect, it } from "vitest";
import {
  canRequestLeave,
  distanceToOffice,
  haversineMeters,
  isWorkingDay,
  leaveCoversSession,
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

describe("distanceToOffice", () => {
  it("office point is inside with distance 0", () => {
    expect(distanceToOffice(28.96246, 50.838971, SETTINGS)).toEqual({ distanceM: 0, outside: false });
  });
  it("50 m north is inside the 100 m radius", () => {
    const r = distanceToOffice(28.96246 + 50 / 111320, 50.838971, SETTINGS);
    expect(r.outside).toBe(false);
    expect(r.distanceM).toBeGreaterThan(45);
    expect(r.distanceM).toBeLessThan(55);
  });
  it("150 m north is outside with distance ~150 m", () => {
    const r = distanceToOffice(28.96246 + 150 / 111320, 50.838971, SETTINGS);
    expect(r.outside).toBe(true);
    expect(r.distanceM).toBeGreaterThan(145);
    expect(r.distanceM).toBeLessThan(155);
  });
  it("Tehran is far outside", () => {
    const r = distanceToOffice(35.68, 51.41, SETTINGS);
    expect(r.outside).toBe(true);
    expect(r.distanceM).toBeGreaterThan(700_000);
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
  it("09:02 is MORNING, on time (inside the 20-minute grace)", () => {
    expect(resolveSession(atTehran("2026-11-23T09:02"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
  });
  it("09:15 is MORNING, on time (inside the 20-minute grace)", () => {
    expect(resolveSession(atTehran("2026-11-23T09:15"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
  });
  it("09:20 is MORNING, on time (grace boundary)", () => {
    expect(resolveSession(atTehran("2026-11-23T09:20"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
  });
  it("09:21 is MORNING, 1 minute late (grace just passed)", () => {
    expect(resolveSession(atTehran("2026-11-23T09:21"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 1 });
  });
  it("09:25 is MORNING, 5 minutes late (25 past start minus 20 grace)", () => {
    expect(resolveSession(atTehran("2026-11-23T09:25"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 5 });
  });
  it("08:30 is MORNING, on time (early check-in)", () => {
    expect(resolveSession(atTehran("2026-11-23T08:30"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 0 });
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
  it("13:00 is still MORNING, 220 minutes late (240 past start minus 20 grace)", () => {
    expect(resolveSession(atTehran("2026-11-23T13:00"), SETTINGS)).toEqual({ session: "MORNING", lateMinutes: 220 });
  });
  it("14:00 is between sessions", () => {
    const r = resolveSession(atTehran("2026-11-23T14:00"), SETTINGS);
    expect(r.session).toBeNull();
  });
  it("16:00 is the earliest EVENING check-in", () => {
    expect(resolveSession(atTehran("2026-11-23T16:00"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 0 });
  });
  it("17:20 is EVENING, on time (grace boundary)", () => {
    expect(resolveSession(atTehran("2026-11-23T17:20"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 0 });
  });
  it("17:30 is EVENING, 10 minutes late (30 past start minus 20 grace)", () => {
    expect(resolveSession(atTehran("2026-11-23T17:30"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 10 });
  });
  it("21:00 is still EVENING", () => {
    expect(resolveSession(atTehran("2026-11-23T21:00"), SETTINGS)).toEqual({ session: "EVENING", lateMinutes: 220 });
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

describe("leaveCoversSession", () => {
  it("FULL_DAY covers both sessions", () => {
    expect(leaveCoversSession("FULL_DAY", "MORNING")).toBe(true);
    expect(leaveCoversSession("FULL_DAY", "EVENING")).toBe(true);
  });
  it("a session leave covers only its own session", () => {
    expect(leaveCoversSession("MORNING", "MORNING")).toBe(true);
    expect(leaveCoversSession("MORNING", "EVENING")).toBe(false);
    expect(leaveCoversSession("EVENING", "MORNING")).toBe(false);
  });
});

describe("canRequestLeave", () => {
  // سه‌شنبه ۳ آذر ۱۴۰۵ = ۲۰۲۶-۱۱-۲۴؛ شیفت صبح ۰۹:۰۰، عصر ۱۷:۰۰
  const day = new Date(Date.UTC(2026, 10, 24));
  const nextDay = new Date(Date.UTC(2026, 10, 25));
  const pastDay = new Date(Date.UTC(2026, 10, 23));

  it("the day before (or earlier) is always allowed", () => {
    expect(canRequestLeave(atTehran("2026-11-23T12:00"), SETTINGS, day, "MORNING").ok).toBe(true);
    expect(canRequestLeave(atTehran("2026-11-23T12:00"), SETTINGS, nextDay, "FULL_DAY").ok).toBe(true);
  });
  it("same day within one hour after shift start is allowed", () => {
    expect(canRequestLeave(atTehran("2026-11-24T09:30"), SETTINGS, day, "MORNING").ok).toBe(true);
    expect(canRequestLeave(atTehran("2026-11-24T10:00"), SETTINGS, day, "MORNING").ok).toBe(true);
    expect(canRequestLeave(atTehran("2026-11-24T17:45"), SETTINGS, day, "EVENING").ok).toBe(true);
    // روز کامل از شروع صبح حساب می‌شود
    expect(canRequestLeave(atTehran("2026-11-24T09:45"), SETTINGS, day, "FULL_DAY").ok).toBe(true);
  });
  it("same day after the one-hour window is rejected", () => {
    expect(canRequestLeave(atTehran("2026-11-24T10:01"), SETTINGS, day, "MORNING").ok).toBe(false);
    expect(canRequestLeave(atTehran("2026-11-24T12:00"), SETTINGS, day, "MORNING").ok).toBe(false);
    expect(canRequestLeave(atTehran("2026-11-24T18:01"), SETTINGS, day, "EVENING").ok).toBe(false);
    // عصر هنوز باز است، ولی مهلت صبح تمام شده
    expect(canRequestLeave(atTehran("2026-11-24T12:00"), SETTINGS, day, "EVENING").ok).toBe(true);
  });
  it("a past day is rejected", () => {
    expect(canRequestLeave(atTehran("2026-11-24T08:00"), SETTINGS, pastDay, "MORNING").ok).toBe(false);
  });
});
