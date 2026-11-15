"use client";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function PhoneInput({ className, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(fieldBase, className)}
      inputMode="numeric"
      dir="ltr"
      onBeforeInput={(e: React.FormEvent<HTMLInputElement> & { data?: string }) => {
        const data = (e.nativeEvent as InputEvent).data;
        if (data && /[^0-9]/.test(data)) e.preventDefault();
      }}
      onChange={(e) => {
        const filtered = e.target.value.replace(/[^0-9]/g, "");
        if (filtered !== e.target.value) e.target.value = filtered;
        onChange?.(e);
      }}
      {...props}
    />
  );
}

export function NumberInput({ className, onChange, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(fieldBase, className)}
      inputMode="numeric"
      dir="ltr"
      onBeforeInput={(e: React.FormEvent<HTMLInputElement> & { data?: string }) => {
        const data = (e.nativeEvent as InputEvent).data;
        if (data && /[^0-9]/.test(data)) e.preventDefault();
      }}
      onChange={(e) => {
        const filtered = e.target.value.replace(/[^0-9]/g, "");
        if (filtered !== e.target.value) e.target.value = filtered;
        onChange?.(e);
      }}
      {...props}
    />
  );
}
