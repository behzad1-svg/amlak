"use client";
import { useEffect, useMemo, useRef, useState } from "react";

export type SearchOption = { id: string; label: string; sub?: string };

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder = "جستجو و انتخاب...",
  label,
  required,
  emptyText = "موردی یافت نشد",
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  options: SearchOption[];
  placeholder?: string;
  label?: string;
  required?: boolean;
  emptyText?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.id === value);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(query) ||
        (o.sub && o.sub.toLowerCase().includes(query)) ||
        o.id.toLowerCase().includes(query)
    );
  }, [options, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      {label && (
        <label className="text-[12.5px] font-medium text-[var(--ink-2)]">
          {label}
          {required ? " *" : ""}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={`mt-1 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-right text-[13.5px] outline-none transition-colors focus:border-[var(--pomegranate)] focus:ring-2 focus:ring-[var(--pomegranate-soft)] disabled:opacity-50 ${
          selected ? "text-[var(--ink)]" : "text-[var(--ink-3)]"
        }`}
      >
        <span className="block truncate">
          {selected ? selected.label : placeholder}
        </span>
        {selected?.sub && (
          <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-3)]" dir="ltr">
            {selected.sub}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full rounded-[12px] border border-[var(--line)] bg-white shadow-lg">
          <div className="border-b border-[var(--line)] p-2">
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="نام یا شماره را بنویسید..."
              className="w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[13px] outline-none focus:border-[var(--pomegranate)]"
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && filtered[0]) {
                  e.preventDefault();
                  onChange(filtered[0].id);
                  setQ("");
                  setOpen(false);
                }
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-[12px] text-[var(--ink-3)]">{emptyText}</li>
            )}
            {filtered.map((o) => {
              const active = o.id === value;
              return (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setQ("");
                      setOpen(false);
                    }}
                    className={`w-full rounded-[8px] px-3 py-2 text-right text-[13px] hover:bg-[var(--paper-2)] ${
                      active ? "bg-[var(--paper-2)] font-bold" : ""
                    }`}
                  >
                    <span className="block truncate">{o.label}</span>
                    {o.sub && (
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--ink-3)]" dir="ltr">
                        {o.sub}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {value && (
            <div className="border-t border-[var(--line)] p-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setQ("");
                  setOpen(false);
                }}
                className="w-full rounded-[8px] px-3 py-1.5 text-right text-[12px] text-[var(--ink-3)] hover:bg-red-50 hover:text-red-600"
              >
                پاک کردن انتخاب
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
