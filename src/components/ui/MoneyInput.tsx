"use client";
import { useId } from "react";
import { NumberInput } from "./Input";
import { formatTomanWithWords } from "@/lib/money";

export function MoneyInput({
  label,
  value,
  onChange,
  placeholder,
  hint,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  id?: string;
}) {
  // نقد ۱۰ — برچسب با htmlFor به ورودی وصل است
  const autoId = useId();
  const fieldId = id ?? autoId;
  const { formatted, words } = formatTomanWithWords(value);
  return (
    <div>
      <label htmlFor={fieldId} className="text-[12.5px] font-medium text-[var(--ink-2)]">{label}</label>
      <NumberInput
        id={fieldId}
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
