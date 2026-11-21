import { formatDate, formatDateTime, cn } from "@/lib/utils";
import { isToday } from "@/lib/jalali";

// نمایش یک تاریخ زمان‌بندی (سررسید پیگیری، بازدید، کارت جلسه، مهلت کار).
// اگر تاریخ امروزِ تهران باشد، با رنگ قرمز پررنگ و برچسب «امروز» مشخص
// می‌شود تا در لیست‌ها از بقیهٔ تاریخ‌ها جدا دیده شود؛ بقیهٔ تاریخ‌ها
// دقیقاً مثل قبل (formatDate) نمایش داده می‌شوند.
// رنگ‌ها در هر دو تم خوانا هستند: text-red-700 و bg-red-50 و ring-red-500
// هر سه در globals.css اورراید تم تاریک دارند.
export function DateText({
  value,
  withTime = false,
  className,
}: {
  value: Date | string | null | undefined;
  /** تاریخ + ساعت (برای کارت جلسه) */
  withTime?: boolean;
  className?: string;
}) {
  if (!value) return <span className={className}>—</span>;
  const text = withTime ? formatDateTime(value) : formatDate(value);
  if (!isToday(value)) return <span className={className}>{text}</span>;
  return (
    <span className={cn("inline-flex items-center gap-1 font-bold text-red-700", className)}>
      {text}
      <span className="rounded-full bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-700 ring-1 ring-red-500">
        امروز
      </span>
    </span>
  );
}
