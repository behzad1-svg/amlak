"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterSearchOptions } from "@/lib/optionSearch";

// انتخاب چند منطقه: کشو پس از هر انتخاب باز است تا چند منطقه پشت سر هم
// انتخاب شوند — برخلاف select بومی که پس از هر انتخاب بسته است.
export function MultiRegionPicker({
  regions,
  value,
  onChange,
  id,
}: {
  regions: string[];
  value: string[];
  onChange: (v: string[]) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // در کشو فقط مناطق بدون انتخاب هست
  const available = useMemo(
    () => regions.filter((r) => !value.includes(r)),
    [regions, value]
  );
  const filtered = useMemo(
    () =>
      filterSearchOptions(
        available.map((r) => ({ id: r, label: r })),
        q
      ).map((o) => o.id),
    [available, q]
  );

  // بستن با کلیک بیرون
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // بستن با Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function openPanel() {
    setOpen(true);
    setQ("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex min-h-[28px] flex-wrap gap-1.5">
        {value.length === 0 && (
          <span className="text-[12px] text-[var(--ink-3)]">
            منطقه انتخاب نشده است
          </span>
        )}
        {value.map((r) => (
          <span
            key={r}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[12px]"
          >
            {r}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== r))}
              className="text-[var(--ink-3)] hover:text-red-600"
              aria-label={`حذف ${r}`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          id={id}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => (open ? setOpen(false) : openPanel())}
          className="rounded-full border border-dashed border-[var(--line-2)] bg-white px-3 py-1 text-[12px]"
        >
          + افزودن منطقه
        </button>
      </div>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-[12px] border border-[var(--line)] bg-white shadow-lg">
          <div className="border-b border-[var(--line)] p-2">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جستجوی منطقه..."
              aria-label="جستجو در مناطق"
              className="w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--pomegranate)]"
            />
          </div>
          <ul
            role="listbox"
            aria-label="مناطق"
            className="max-h-56 overflow-y-auto p-1"
          >
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-[12px] text-[var(--ink-3)]">
                {available.length === 0
                  ? "همه مناطق انتخاب شده است"
                  : "موردی یافت نشد"}
              </li>
            )}
            {filtered.map((r) => (
              <li key={r}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => onChange([...value, r])}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-right text-[13px] hover:bg-[var(--paper-2)]"
                >
                  <span
                    aria-hidden
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border border-[var(--line-2)] bg-white"
                  />
                  <span className="truncate">{r}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="border-t border-[var(--line)] p-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-[8px] px-3 py-2 text-[13px] font-bold text-[var(--pomegranate)] hover:bg-[var(--paper-2)]"
            >
              تمام
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
