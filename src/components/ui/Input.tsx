import { cn } from "@/lib/utils";

const fieldBase =
  "w-full rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-[13.5px] text-[var(--ink)] placeholder:text-[var(--ink-3)]/60 outline-none transition-colors focus:border-[var(--pomegranate)] focus:ring-2 focus:ring-[var(--pomegranate-soft)]";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldBase, className)} {...props} />;
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
