"use client";
import { NumberInput } from "./Input";
import { formatTomanWithWords } from "@/lib/money";

export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  const { formatted, words } = formatTomanWithWords(value);
  return (
    <div>
      <label className="text-[12.5px] font-medium text-[var(--ink-2)]">{label}</label>
      <NumberInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1"
      />
      {value ? (
        <p className="mt-1 text-[12px] font-medium text-[var(--ink-2)]">
          {formatted}
          {words ? <span className="text-[var(--ink-3)]"> — {words}</span> : null}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">{hint}</p>
      ) : null}
    </div>
  );
}
