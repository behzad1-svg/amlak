"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CUSTOMER_STAGE_LABELS, CUSTOMER_STAGE_ORDER, TEMPERATURE_COLORS, TEMPERATURE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Customer = { id: string; name: string; phone: string; stage: string; temperature: string; nextFollowUpAt: string | null; needsManagerReview: boolean };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showLost, setShowLost] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  function load() {
    fetch(`/api/customers${showLost ? "?showLost=true" : ""}`).then((r) => r.json()).then((d) => setCustomers(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, [showLost]);

  async function handleDrop(newStage: string) {
    if (!dragId) return;
    const c = customers.find((x) => x.id === dragId);
    if (c?.stage === "LOST" && newStage === "INITIAL_CONTACT") return;
    const body: Record<string, unknown> = { stage: newStage };
    if (newStage === "LOST") {
      const cat = prompt("دلیل: CUSTOMER_WITHDREW / PRICE_REJECTED / NO_RESPONSE / NO_SUITABLE_PROPERTY / OTHER", "OTHER");
      if (!cat) { setDragId(null); return; }
      body.lostReasonCategory = cat;
    }
    await fetch(`/api/customers/${dragId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setDragId(null);
    load();
  }

  const stages = [...CUSTOMER_STAGE_ORDER, ...(showLost ? ["LOST"] as const : [])];
  const grouped = new Map<string, Customer[]>();
  for (const s of stages) grouped.set(s, []);
  for (const c of customers) { const arr = grouped.get(c.stage); if (arr) arr.push(c); else grouped.get("INITIAL_CONTACT")!.push(c); }

  const stageAccent: Record<string, string> = {
    INITIAL_CONTACT: "border-[#C7D8EE] bg-[#EFF4FF]",
    QUALIFIED: "border-[#F1D9A8] bg-[var(--amber-soft)]",
    VIEWING: "border-[#C9D8E8] bg-[#EEF2FF]",
    CONTRACT: "border-[#BFE8D6] bg-[#EAF7F0]",
    LOST: "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]",
  };

  return (
    <div>
      <Header
        title="مشتریان"
        subtitle="بکشید و رها کنید — هر ستون یک مرحله از خط لوله است"
        action={
          <div className="flex items-center gap-2">
            <label className="hidden sm:flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
              <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> نمایش بایگانی
            </label>
            <Link href="/customers/new"><Button>＋ مشتری جدید</Button></Link>
          </div>
        }
      />
      <div className="p-4 flex gap-3 overflow-x-auto pb-6">
        {stages.map((stage) => {
          const list = grouped.get(stage) ?? [];
          return (
            <div key={stage} onDragOver={(e) => e.preventDefault()} onDrop={() => handleDrop(stage)} className={`w-[276px] shrink-0 rounded-[16px] border p-3 ${stageAccent[stage] ?? "border-[var(--line)] bg-white"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-extrabold tracking-widest text-[var(--ink-2)]">{CUSTOMER_STAGE_LABELS[stage]}</h3>
                <span className="rounded-full bg-white border border-[var(--line)] px-2 py-0.5 text-[11px] font-bold">{list.length}</span>
              </div>
              <div className="mt-3 h-1 rounded-full bg-white/70 border border-black/5"><div className="h-1 rounded-full bg-[var(--ink)]/15" style={{ width: `${Math.min(100, list.length * 18)}%` }} /></div>
              <div className="mt-3 space-y-2.5">
                {list.map((c) => {
                  const overdue = c.nextFollowUpAt && new Date(c.nextFollowUpAt) < new Date() && c.stage !== "LOST";
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      className={`rounded-[14px] border bg-white p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow ${overdue ? "border-[var(--pomegranate-line)]" : "border-[var(--line)]"}`}
                    >
                      <Link href={`/customers/${c.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${TEMPERATURE_COLORS[c.temperature] ?? "bg-zinc-300"}`} title={TEMPERATURE_LABELS[c.temperature] ?? c.temperature} />
                          <span className="text-[13.5px] font-bold leading-none truncate">{c.name}</span>
                        </div>
                        <div className="mt-1 text-[11px] tracking-wide text-[var(--ink-3)]" dir="ltr">{c.phone}</div>
                        {c.needsManagerReview && <div className="mt-2 rounded-full bg-[var(--amber-soft)] border border-[#F1D9A8] px-2 py-1 text-[11px] font-medium text-[var(--amber)]">نیاز به بررسی مدیر</div>}
                        <div className="mt-2 flex items-center gap-1.5">
                          {overdue
                            ? <Badge className="bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)] text-[11px]">عقب‌افتاده · {formatDate(c.nextFollowUpAt)}</Badge>
                            : c.nextFollowUpAt
                              ? <span className="text-[11px] text-[var(--ink-3)]">پیگیری {formatDate(c.nextFollowUpAt)}</span>
                              : <span className="text-[11px] text-[var(--ink-3)]/60">بدون پیگیری</span>}
                        </div>
                      </Link>
                    </div>
                  );
                })}
                {list.length === 0 && <div className="rounded-[12px] border border-dashed border-[var(--line-2)] bg-white/60 px-3 py-6 text-center text-[12px] text-[var(--ink-3)]">خالی</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
