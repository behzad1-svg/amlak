import { describe, expect, it } from "vitest";
import { dayCellClassName, getDayCellState, type DayCellState } from "./datePickerCell";

// امروز مرجع تست‌ها: شنبه ۳۰ آبان ۱۴۰۵ (مطابق getTodayJalali در jalali.test.ts)
const TODAY = { jy: 1405, jm: 8, jd: 30 };

function state(day: { jy: number; jm: number; jd: number }, extra?: Partial<DayCellState>): DayCellState {
  return {
    ...getDayCellState({ day, today: TODAY, minDate: TODAY, selected: null }),
    ...extra,
  };
}

describe("getDayCellState", () => {
  it("امروز را امروز می‌داند، نه جمعه و نه غیرفعال", () => {
    const s = state(TODAY);
    expect(s.today).toBe(true);
    expect(s.disabled).toBe(false);
    expect(s.friday).toBe(false);
    expect(s.selected).toBe(false);
  });

  it("جمعهٔ گذشته (۲۹ آبان) جمعه است ولی غیرفعال", () => {
    const s = state({ jy: 1405, jm: 8, jd: 29 });
    expect(s.friday).toBe(true);
    expect(s.disabled).toBe(true);
    expect(s.today).toBe(false);
  });

  it("جمعهٔ آینده (۶ آذر) جمعه است و قابل انتخاب", () => {
    const s = state({ jy: 1405, jm: 9, jd: 6 });
    expect(s.friday).toBe(true);
    expect(s.disabled).toBe(false);
  });

  it("روز عادی گذشته غیرفعال است", () => {
    expect(state({ jy: 1405, jm: 8, jd: 28 }).disabled).toBe(true);
  });

  it("روز عادی آینده نه غیرفعال است نه جمعه", () => {
    const s = state({ jy: 1405, jm: 9, jd: 1 });
    expect(s.disabled).toBe(false);
    expect(s.friday).toBe(false);
    expect(s.today).toBe(false);
  });

  it("تعطیل رسمی غیرجمعه (۲ دی) تعطیل است ولی جمعه نیست", () => {
    const s = state({ jy: 1405, jm: 10, jd: 2 });
    expect(s.holiday).toBe(true);
    expect(s.friday).toBe(false);
  });

  it("روز انتخاب‌شده را انتخاب‌شده می‌داند", () => {
    const s = getDayCellState({ day: { jy: 1405, jm: 9, jd: 1 }, today: TODAY, minDate: TODAY, selected: { jy: 1405, jm: 9, jd: 1 } });
    expect(s.selected).toBe(true);
  });
});

describe("dayCellClassName", () => {
  it("امروز دایرهٔ قرمز برجسته + رنگ متفاوت دارد", () => {
    const cls = dayCellClassName(state(TODAY));
    expect(cls).toContain("ring-2");
    expect(cls).toContain("ring-red-500");
    expect(cls).toContain("rounded-full");
    expect(cls).toContain("bg-red-100");
    expect(cls).toContain("text-red-700");
    expect(cls).toContain("font-bold");
    expect(cls).not.toContain("text-zinc-300");
    expect(cls).not.toContain("cursor-not-allowed");
  });

  it("امروزِ انتخاب‌شده حلقهٔ قرمز را نگه می‌دارد", () => {
    const cls = dayCellClassName(state(TODAY, { selected: true }));
    expect(cls).toContain("ring-2");
    expect(cls).toContain("ring-red-500");
    expect(cls).toContain("bg-[var(--pomegranate)]");
    expect(cls).toContain("text-white");
    expect(cls).not.toContain("bg-red-100");
  });

  it("جمعهٔ آینده قرمز پررنگ است، بدون حلقه", () => {
    const cls = dayCellClassName(state({ jy: 1405, jm: 9, jd: 6 }));
    expect(cls).toContain("text-red-600");
    expect(cls).toContain("font-bold");
    expect(cls).not.toContain("ring-2");
  });

  it("روز عادی آینده نه قرمز است نه حلقه دارد", () => {
    const cls = dayCellClassName(state({ jy: 1405, jm: 9, jd: 1 }));
    expect(cls).not.toContain("red");
    expect(cls).not.toContain("ring-2");
    expect(cls).not.toContain("font-bold");
  });

  it("تعطیل رسمی غیرجمعه فقط قرمز است، نه پررنگ", () => {
    const cls = dayCellClassName(state({ jy: 1405, jm: 10, jd: 2 }));
    expect(cls).toContain("text-red-600");
    expect(cls).not.toContain("font-bold");
  });

  it("روز گذشته خاکستری و غیرفعال است — حتی اگر جمعه باشد حلقه/قرمز ندارد", () => {
    const pastFriday = dayCellClassName(state({ jy: 1405, jm: 8, jd: 29 }));
    expect(pastFriday).toContain("cursor-not-allowed");
    expect(pastFriday).toContain("text-zinc-300");
    expect(pastFriday).toContain("opacity-60");
    expect(pastFriday).not.toContain("text-red-600");
    expect(pastFriday).not.toContain("ring-2");
    const pastOrdinary = dayCellClassName(state({ jy: 1405, jm: 8, jd: 28 }));
    expect(pastOrdinary).toContain("cursor-not-allowed");
    expect(pastOrdinary).not.toContain("ring-2");
  });
});
