"use client";
import { useEffect, useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toJalali, jalaliToGregorian, getJalaliDaysInMonth, isValidJalaliDate } from "@/lib/jalali";
import { cn, toFaDigits } from "@/lib/utils";

const MONTH_NAMES = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function getWeekdayOffset(jy: number, jm: number): number {
  const d = jalaliToGregorian(jy, jm, 1);
  return (d.getDay() + 1) % 7;
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

  // نقد ۱۰ — Escape تقویم را می‌بندد
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

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
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="dialog" aria-label="انتخاب تاریخ" className="absolute z-40 mt-2 w-72 rounded-[16px] border border-[var(--line)] bg-white p-3 shadow-[0_8px_24px_rgba(22,26,36,0.12)] right-0">
            <div className="flex items-center justify-between mb-3">
              <button type="button" onClick={prevMonth} aria-label="ماه قبل" className="rounded-[10px] p-1.5 hover:bg-[var(--paper-2)]"><ChevronRight className="h-4 w-4" /></button>
              <span className="text-[13px] font-bold">{MONTH_NAMES[view.jm - 1]} {toFaDigits(String(view.jy))}</span>
              <button type="button" onClick={nextMonth} aria-label="ماه بعد" className="rounded-[10px] p-1.5 hover:bg-[var(--paper-2)]"><ChevronLeft className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => <span key={w} className="py-1 text-[11px] font-medium text-[var(--ink-3)]">{w}</span>)}
              {cells.map((d, i) =>
                d === null ? <span key={`e-${i}`} /> : (
                  <button
                    key={d}
                    type="button"
                    onClick={() => pickDay(d)}
                    aria-label={toFaDigits(`${d} ${MONTH_NAMES[view.jm - 1]} ${view.jy}`)}
                    className={cn("min-h-10 rounded-[10px] py-1.5 text-[13px] hover:bg-[var(--paper-2)]",
                      selected && selected.jy === view.jy && selected.jm === view.jm && selected.jd === d && "bg-[var(--pomegranate)] text-white hover:bg-[var(--pomegranate)]"
                    )}
                  >
                    {toFaDigits(String(d))}
                  </button>
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
