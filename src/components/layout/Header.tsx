"use client";
export function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white/80 px-4 py-4 backdrop-blur sm:px-6">
      <div className="min-w-0">
        <h1 className="text-[18px] font-extrabold tracking-tight text-[var(--ink)]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] leading-5 text-[var(--ink-3)]">{subtitle}</p>}
      </div>
      {action ? <div className="shrink-0 max-sm:w-full">{action}</div> : null}
    </div>
  );
}
