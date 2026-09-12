import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline" | "danger" | "sea";
type Size = "sm" | "md" | "lg";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  const variants: Record<Variant, string> = {
    primary: "bg-[var(--pomegranate)] text-white hover:bg-[var(--pomegranate-2)] shadow-[0_1px_0_rgba(0,0,0,0.08)]",
    ghost: "bg-transparent text-[var(--ink-2)] hover:bg-[var(--paper-2)] border border-transparent",
    outline: "bg-white border border-[var(--line)] text-[var(--ink-2)] hover:bg-[var(--paper-2)]",
    danger: "bg-[#C0392B] text-white hover:bg-[#A93226]",
    sea: "bg-[var(--sea)] text-white hover:bg-[#0F4A4A]",
  };
  const sizes: Record<Size, string> = {
    sm: "px-3 py-1.5 text-[13px] rounded-[10px]",
    md: "px-4 py-2 text-[13.5px] rounded-[12px]",
    lg: "px-6 py-3 text-[15px] rounded-[14px]",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}
