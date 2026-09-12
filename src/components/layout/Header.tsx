"use client";
export function Header({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] bg-white/80 px-6 py-4 backdrop-blur">
      <div className="min-w-0">
        <h1 className="text-[18px] font-extrabold tracking-tight text-[var(--ink)]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] leading-5 text-[var(--ink-3)]">{subtitle}</p>}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
