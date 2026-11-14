// نقد ۱ و ۹ — اسکلت بارگذاری؛ بارگذاری هرگز شبیه «خالی» نیست.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-[12px] bg-[var(--paper-3)] ${className}`} aria-hidden="true" />;
}

export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1120px]" aria-label="در حال بارگذاری">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}
