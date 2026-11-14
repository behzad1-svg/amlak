"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatToman, formatTomanCompact } from "@/lib/utils";

/**
 * نمایش مبلغ با دو حالت: در صفحه‌های کوچک (<sm) فرم فشرده
 * («۳٫۵ میلیارد تومان») و در صفحه‌های بزرگ‌تر فرم کامل
 * («۳٬۵۰۰٬۰۰۰٬۰۰۰ تومان»).
 * نقد ۱۱ — با لمس/کلیک روی مبلغ، فرم کامل نمایش داده می‌شود (نه فقط title):
 * داخل کارت‌های لینک، کلیک مبلغ ناوبری را لغو می‌کند تا فقط جابه‌جا شود.
 * با bare=true واحد «تومان» در فرم فشرده حذف می‌شود (ابتدای بازه «از ... تا ...»).
 */
export function MoneyText({
  value,
  bare = false,
  className,
}: {
  value: bigint | string | number | null | undefined;
  bare?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const full = formatToman(value);
  const compact = formatTomanCompact(value, bare);
  if (full === compact) {
    return <span className={className}>{full}</span>;
  }
  return (
    <span
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={full}
      title={full}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        setExpanded((v) => !v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.stopPropagation();
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      className={cn("cursor-pointer underline decoration-dotted underline-offset-4", className)}
    >
      <span className={expanded ? "hidden" : "sm:hidden"}>{compact}</span>
      <span className={expanded ? "" : "hidden sm:inline"}>{full}</span>
    </span>
  );
}
