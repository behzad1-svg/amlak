import { getTehranWeekdayLong, getTodayJalali, MONTH_NAMES, toPersianDigits } from "@/lib/jalali";

// Today badge — a prominent circle showing today's Jalali date:
// big day number, month name, weekday and full date. Used in the header
// of the Today page and the dashboard, so the current day is obvious.
export function TodayBadge() {
  const today = getTodayJalali();
  const weekday = getTehranWeekdayLong();
  const day = toPersianDigits(String(today.jd));
  const month = MONTH_NAMES[today.jm - 1];
  const year = toPersianDigits(String(today.jy));
  const label = `امروز ${weekday} ${day} ${month} ${year}`;
  return (
    <div className="flex items-center gap-2.5" aria-label={label} title={label}>
      <div className="flex h-[68px] w-[68px] shrink-0 flex-col items-center justify-center rounded-full border-2 border-[var(--pomegranate)] bg-[var(--pomegranate-soft)]">
        <span className="text-[26px] font-extrabold leading-none text-[var(--pomegranate)]">{day}</span>
        <span className="mt-1 text-[11px] font-bold leading-none text-[var(--pomegranate)]">{month}</span>
      </div>
      <div className="leading-tight">
        <div className="text-[13px] font-bold text-[var(--ink)]">{weekday}</div>
        <div className="mt-0.5 text-[12px] text-[var(--ink-3)]">
          {day} {month} {year}
        </div>
      </div>
    </div>
  );
}
