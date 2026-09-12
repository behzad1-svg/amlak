import { cn } from "@/lib/utils";
export function Badge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-[var(--line)] bg-white px-2.5 py-0.5 text-[11.5px] font-medium text-[var(--ink-2)]",
        className
      )}
      {...props}
    />
  );
}
