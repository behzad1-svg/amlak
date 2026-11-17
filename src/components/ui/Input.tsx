"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn, toEnDigits } from "@/lib/utils";

const fieldBase =
  "min-w-0 w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-3)]/60 outline-none transition-colors focus:border-[var(--pomegranate)] focus:ring-2 focus:ring-[var(--pomegranate-soft)]";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
}

/** فیلد رمز با دکمه چشم برای نمایش/پنهان‌کردن رمز */
export function PasswordInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <input
        {...props}
        type={show ? "text" : "password"}
        dir="ltr"
        className={cn(fieldBase, "pr-10 text-left")}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--ink-3)] hover:text-[var(--ink)]"
        aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldBase, "min-h-[88px] resize-y py-3", className)} {...props} />;
}
export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldBase, "bg-white", className)} {...props}>{children}</select>;
}
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-[12.5px] font-medium text-[var(--ink-2)]", className)} {...props} />;
}

/** پس از فیلتر کردن مقدار ورودی، مکان نما را به جای درستش برگردان
 * (ویرایش وسط متن نباید مکان نما را به انتها بپراند). */
function keepCaret(input: HTMLInputElement, before: string, after: string) {
  const start = input.selectionStart ?? before.length;
  const end = input.selectionEnd ?? before.length;
  const shift = (pos: number) => {
    let j = 0;
    let removed = 0;
    for (let i = 0; i < Math.min(pos, before.length); i++) {
      if (j < after.length && before[i] === after[j]) j++;
      else removed++;
    }
    return Math.max(0, pos - removed);
  };
  const newStart = shift(start);
  const newEnd = shift(end);
  input.value = after;
  try {
    input.setSelectionRange(newStart, newEnd);
  } catch {
    // ورودی هایی که انتخاب متن ندارند
  }
}

export function PhoneInput({ className, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(fieldBase, "text-right font-mono", className)}
      inputMode="numeric"
      dir="ltr"
      maxLength={11}
      onChange={(e) => {
        // ارقام فارسی/عربی اول به لاتین تبدیل می‌شوند، بعد فیلتر — onBeforeInput
        // مسدودکننده حذف شد چون ارقام فارسی را پیش از رسیدن به onChange بلاک می‌کرد
        const converted = toEnDigits(e.target.value);
        const filtered = converted.replace(/[^0-9]/g, "");
        if (filtered !== e.target.value) keepCaret(e.target, converted, filtered);
        onChange?.(e);
      }}
      {...props}
    />
  );
}

export function NumberInput({ className, onChange, allowDecimal, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { allowDecimal?: boolean }) {
  return (
    <input
      className={cn(fieldBase, "text-right font-mono", className)}
      inputMode={allowDecimal ? "decimal" : "numeric"}
      dir="ltr"
      onChange={(e) => {
        // ارقام فارسی/عربی اول به لاتین تبدیل می‌شوند (۰٫۲۵ → 0.25)؛ ممیز فارسی ٫ و ،
        // به نقطه تبدیل می‌شود؛ حداکثر ۲ رقم اعشار
        const converted = toEnDigits(e.target.value);
        let filtered = converted;
        if (allowDecimal) {
          filtered = filtered.replace(/٫|،/g, ".").replace(/[^0-9.]/g, "");
          const dot = filtered.indexOf(".");
          if (dot !== -1) filtered = filtered.slice(0, dot + 1) + filtered.slice(dot + 1).replace(/\./g, "").slice(0, 2);
        } else {
          filtered = filtered.replace(/[^0-9]/g, "");
        }
        if (filtered !== e.target.value) keepCaret(e.target, converted, filtered);
        onChange?.(e);
      }}
      {...props}
    />
  );
}
