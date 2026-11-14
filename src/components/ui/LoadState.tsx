// نقد ۱ — حالت خطای صفحه: پیام روشن + دکمهٔ تلاش دوباره.
// قبلاً خطا یا پنهان می‌ماند (صفحه خالی) یا پیام «همه‌چیز خوب است» نشان داده می‌شد.
"use client";
import { Button } from "./Button";
import { PageSkeleton } from "./Skeleton";

export { PageSkeleton };

export function PageError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-4 sm:p-6" role="alert">
      <div className="max-w-[560px] rounded-[16px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] p-5">
        <div className="text-[14px] font-extrabold text-[var(--pomegranate)]">داده بارگذاری نشد</div>
        <p className="mt-1 text-[13px] leading-6 text-[var(--ink-2)]">{message}</p>
        <Button className="mt-3" onClick={onRetry}>
          تلاش دوباره
        </Button>
      </div>
    </div>
  );
}
