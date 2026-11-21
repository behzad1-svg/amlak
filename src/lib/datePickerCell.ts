import { compareJalali, type JalaliDate } from "./jalali";
import { isFriday, isJalaliHoliday } from "./holidays";
import { cn } from "./utils";

// وضعیت یک روز در شبکهٔ تقویم JalaliDatePicker — خالص و قابل تست.
export type DayCellState = {
  /** روز گذشته (یا قبل از حداقل تاریخ): خاکستری و غیرقابل انتخاب */
  disabled: boolean;
  /** روز انتخاب‌شدهٔ فعلی */
  selected: boolean;
  /** امروز (تهران) */
  today: boolean;
  /** جمعه */
  friday: boolean;
  /** تعطیل رسمی (غیر جمعه) */
  holiday: boolean;
};

export function getDayCellState(args: {
  day: JalaliDate;
  today: JalaliDate;
  minDate: JalaliDate | null;
  selected: JalaliDate | null;
}): DayCellState {
  const { day, today, minDate, selected } = args;
  return {
    disabled: minDate ? compareJalali(day, minDate) < 0 : false,
    selected: selected ? compareJalali(day, selected) === 0 : false,
    today: compareJalali(day, today) === 0,
    friday: isFriday(day.jy, day.jm, day.jd),
    holiday: isJalaliHoliday(day.jy, day.jm, day.jd),
  };
}

// کلاس سلول روز. ترتیب عمدی است تا tailwind-merge تضادها را درست حل کند:
// غیرفعال بر همه غلبه می‌کند؛ انتخاب‌شده پس‌زمینه/متن امروز را می‌برد ولی
// حلقهٔ قرمز امروز دور سلول انتخاب‌شده هم می‌ماند.
export function dayCellClassName(s: DayCellState): string {
  return cn(
    "min-h-10 rounded-[10px] py-1.5 text-[13px]",
    s.disabled
      ? "cursor-not-allowed text-zinc-300 opacity-60"
      : // امروز پس‌زمینهٔ قرمز خودش را دارد؛ هاور نباید آن را بپوشاند.
        !s.today && !s.selected
        ? "hover:bg-[var(--paper-2)]"
        : undefined,
    // امروز: دایرهٔ قرمز برجسته + پس‌زمینه و متن کاملاً متفاوت از بقیهٔ روزها.
    // در تم تاریک هم خواناست: bg-red-100 و text-red-700 و ring-red-500 هر سه
    // در globals.css اورراید تاریک دارند.
    !s.disabled &&
      s.today &&
      "rounded-full bg-red-100 font-bold text-red-700 ring-2 ring-red-500",
    !s.disabled &&
      s.selected &&
      "bg-[var(--pomegranate)] text-white hover:bg-[var(--pomegranate)]",
    // جمعه: قرمز پررنگ — متمایز از روزهای عادی و از تعطیل‌های رسمی دیگر
    // که فقط قرمز (بدون پررنگ) هستند.
    !s.disabled && !s.selected && s.friday && "font-bold text-red-600",
    !s.disabled && !s.selected && !s.friday && s.holiday && "text-red-600",
  );
}
