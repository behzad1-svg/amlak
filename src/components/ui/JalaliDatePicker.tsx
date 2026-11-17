"use client";
import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toJalali, jalaliToGregorian, getJalaliDaysInMonth, isValidJalaliDate } from "@/lib/jalali";
import { isJalaliHoliday } from "@/lib/holidays";
import { cn, toFaDigits } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";

const MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function getWeekdayOffset(jy: number, jm: number): number {
  const d = jalaliToGregorian(jy, jm, 1);
  return (d.getDay() + 1) % 7;
}

// بازهٔ سال‌ها برای انتخابگر سریع سال (تاریخ‌های دور مثل سال تولد)
function jalaliYearOptions(): number[] {
  const now = toJalali(new Date());
  const current = now ? now.jy : 1404;
  const years: number[] = [];
  for (let y = 1300; y <= current + 2; y++) years.push(y);
  return years;
}

function getInitialView(value: string | null) {
  if (value) {
    const j = toJalali(value);
    if (j) return { jy: j.jy, jm: j.jm };
  }
  const now = toJalali(new Date());
  return now ? { jy: now.jy, jm: now.jm } : { jy: 1404, jm: 7 };
}

export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  id,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  /** نقد ۱۰ — id برای اتصال برچسب (htmlFor) به دکمهٔ بازکننده */
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => getInitialView(value));

  const selected = useMemo(() => (value ? toJalali(value) : null), [value]);
  const yearOptions = useMemo(() => jalaliYearOptions(), []);


  function handleOpen(next: boolean) {
    if (next) setView(getInitialView(value));
    setOpen(next);
  }

  function displayValue(): string {
    if (!value || !selected) return "";
    // نقد ۱۱ — ارقام فارسی در نمایش تاریخ
    return toFaDigits(`${selected.jy}/${String(selected.jm).padStart(2, "0")}/${String(selected.jd).padStart(2, "0")}`);
  }

  function pickDay(jd: number) {
    if (!isValidJalaliDate(view.jy, view.jm, jd)) return;
    const d = jalaliToGregorian(view.jy, view.jm, jd);
    d.setHours(12, 0, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
  }

  function goToday() {
    const now = toJalali(new Date());
    if (!now) return;
    setView({ jy: now.jy, jm: now.jm });
    const d = jalaliToGregorian(now.jy, now.jm, now.jd);
    d.setHours(12, 0, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
  }

  function prevMonth() {
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { jy: v.jy, jm: v.jm - 1 }));
  }
  function nextMonth() {
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { jy: v.jy, jm: v.jm + 1 }));
  }

  const daysInMonth = getJalaliDaysInMonth(view.jy, view.jm);
  const offset = getWeekdayOffset(view.jy, view.jm);
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div className="relative">
      <button
        type="button"
        id={id}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={displayValue() || placeholder}
        onClick={() => handleOpen(!open)}
        className={cn("min-h-11 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-[13.5px] text-right hover:border-[var(--line-2)]", !value && "text-[var(--ink-3)]/60")}
      >
        {displayValue() || placeholder}
      </button>
      {value && (
        <button type="button" onClick={() => onChange(null)} aria-label="پاک کردن تاریخ" className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-[var(--ink-3)] hover:text-[var(--ink)]">×</button>
      )}
      {open && (
        <Modal
          layout="popover"
          onClose={() => setOpen(false)}
          ariaLabel="انتخاب تاریخ"
          panelClassName="absolute z-40 mt-2 w-72 rounded-[16px] border border-[var(--line)] bg-white p-3 shadow-[0_8px_24px_rgba(22,26,36,0.12)] right-0"
          autoFocus={false}
          lockScroll={false}
          trapFocus={false}
        >
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={prevMonth} aria-label="ماه قبل" className="rounded-[10px] p-1.5 hover:bg-[var(--paper-2)]"><ChevronRight className="h-4 w-4" /></button>
              <span className="flex items-center gap-1.5 text-[13px] font-bold">
                {MONTH_NAMES[view.jm - 1]}
                <select
                  value={view.jy}
                  onChange={(e) => setView((v) => ({ ...v, jy: Number(e.target.value) }))}
                  aria-label="سال"
                  className="rounded-[8px] border border-[var(--line)] bg-white px-1 py-0.5 text-[13px] font-bold outline-none"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{toFaDigits(String(y))}</option>
                  ))}
                </select>
              </span>
              <button type="button" onClick={nextMonth} aria-label="ماه بعد" className="rounded-[10px] p-1.5 hover:bg-[var(--paper-2)]"><ChevronLeft className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w, i) => <span key={w} className={cn("py-1 text-[11px] font-medium text-[var(--ink-3)]", i === 6 && "text-red-600")}>{w}</span>)}
              {cells.map((d, i) =>
                d === null ? <span key={`e-${i}`} /> : (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pickDay(d)}
                    aria-label={toFaDigits(`${d} ${MONTH_NAMES[view.jm - 1]} ${view.jy}`)}
                    className={cn("min-h-10 rounded-[10px] py-1.5 text-[13px] hover:bg-[var(--paper-2)]",
                      selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d
                        ? "bg-[var(--pomegranate)] text-white hover:bg-[var(--pomegranate)]"
                        : isJalaliHoliday(view.jy, view.jm, d) && "text-red-600"
                    )}
                  >
                    {toFaDigits(String(d))}
                  </button>
                )
              )}
            </div>
            <button type="button" onClick={goToday} className="mt-3 w-full rounded-[10px] border border-[var(--line)] bg-[var(--paper-2)] px-3 py-1.5 text-[12.5px] font-bold hover:bg-[var(--paper)]">
              امروز
            </button>
        </Modal>
      )}
    </div>
  );
}
