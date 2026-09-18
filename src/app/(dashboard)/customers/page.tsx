"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import {
  CUSTOMER_KANBAN_COLUMNS,
  CUSTOMER_STAGE_LABELS,
  CUSTOMER_STAGE_COLORS,
  LOST_REASON_LABELS,
  TEMPERATURE_COLORS,
  TEMPERATURE_LABELS,
} from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Customer = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  temperature: string;
  nextFollowUpAt: string | null;
  needsManagerReview: boolean;
  lostReasonCategory?: string | null;
};

const STAGE_ACCENT: Record<string, string> = {
  NEW: "border-slate-200 bg-slate-50",
  INITIAL_CONTACT: "border-[#C7D8EE] bg-[#EFF4FF]",
  QUALIFIED: "border-[#F1D9A8] bg-[var(--amber-soft)]",
  VIEWING: "border-[#C9D8E8] bg-[#EEF2FF]",
  CONTRACT: "border-[#BFE8D6] bg-[#EAF7F0]",
  WON: "border-emerald-300 bg-emerald-50",
  FAILED: "border-red-200 bg-red-50",
  LOST: "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showLost, setShowLost] = useState(false);
  const [showOutcomes, setShowOutcomes] = useState(true);
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostDraft, setLostDraft] = useState<{ id: string; category: string; detail: string } | null>(null);
  const [msg, setMsg] = useState("");

  function load() {
    const params = new URLSearchParams();
    if (showLost) params.set("showLost", "true");
    if (search.trim()) params.set("search", search.trim());
    const qs = params.toString();
    fetch(`/api/customers${qs ? `?${qs}` : ""}`)
      .then((r) => r.json())
      .then((d) => setCustomers(Array.isArray(d) ? d : []));
  }

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLost, search]);

  async function moveStage(id: string, newStage: string) {
    if (newStage === "LOST" || newStage === "FAILED") {
      setLostDraft({ id, category: newStage === "FAILED" ? "OTHER" : "CUSTOMER_WITHDREW", detail: "" });
      return;
    }
    const res = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: newStage }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error || "خطا در تغییر مرحله");
      setTimeout(() => setMsg(""), 2500);
    }
    setDragId(null);
    load();
  }

  async function confirmLost() {
    if (!lostDraft) return;
    const body: Record<string, unknown> = {
      stage: lostDraft.category === "OTHER" || lostDraft.category ? undefined : undefined,
      lostReasonCategory: lostDraft.category,
      lostReasonDetail: lostDraft.detail || null,
    };
    // FAILED and LOST are both archive-ish; use LOST for pipeline archive, FAILED for dead deals
    const targetStage = lostDraft.detail === "__FAILED__" ? "FAILED" : "LOST";
    // Prefer explicit stage from the drop target stored in category context
    const stage = (lostDraft as typeof lostDraft & { _stage?: string })._stage ?? "LOST";
    body.stage = stage === "FAILED" ? "FAILED" : "LOST";

    const res = await fetch(`/api/customers/${lostDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMsg(j.error || "خطا");
      setTimeout(() => setMsg(""), 2500);
    }
    setLostDraft(null);
    setDragId(null);
    load();
  }

  const columns = useMemo(() => {
    const base = [...CUSTOMER_KANBAN_COLUMNS];
    if (showOutcomes === false) {
      return base.filter((s) => s !== "WON" && s !== "FAILED" && s !== "NEW");
    }
    return showLost ? [...base, "LOST" as const] : base;
  }, [showLost, showOutcomes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q));
  }, [customers, search]);

  return (
    <div>
      <Header
        title="مشتریان"
        subtitle="بکشید و رها کنید — هر ستون یک مرحله از خط لوله است"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="جستجوی نام یا شماره..."
              className="w-[200px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="hidden sm:flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
              <input type="checkbox" checked={showOutcomes} onChange={(e) => setShowOutcomes(e.target.checked)} /> نتایج
            </label>
            <label className="hidden sm:flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
              <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> بایگانی
            </label>
            <Link href="/customers/new"><Button>＋ مشتری جدید</Button></Link>
          </div>
        }
      />
      {msg && <div className="mx-6 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</div>}

      {lostDraft && (
        <div className="mx-6 mt-3 rounded-[14px] border border-[var(--line)] bg-white p-4">
          <div className="text-[13px] font-bold mb-2">بایگانی / ناموفق — دلیل را انتخاب کنید</div>
          <div className="flex flex-wrap gap-2 items-end">
            <Select
              className="w-[220px]"
              value={lostDraft.category}
              onChange={(e) => setLostDraft({ ...lostDraft, category: e.target.value })}
            >
              {Object.entries(LOST_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Select
              className="w-[160px]"
              value={(lostDraft as { _stage?: string })._stage ?? "LOST"}
              onChange={(e) => setLostDraft({ ...lostDraft, _stage: e.target.value } as typeof lostDraft)}
            >
              <option value="LOST">بایگانی (LOST)</option>
              <option value="FAILED">ناموفق (FAILED)</option>
            </Select>
            <Input
              className="flex-1 min-w-[180px]"
              placeholder="توضیح (اختیاری)"
              value={lostDraft.detail}
              onChange={(e) => setLostDraft({ ...lostDraft, detail: e.target.value })}
            />
            <Button onClick={confirmLost}>ثبت</Button>
            <Button variant="ghost" onClick={() => { setLostDraft(null); setDragId(null); }}>انصراف</Button>
          </div>
        </div>
      )}

      <div className="p-4 flex gap-3 overflow-x-auto pb-6">
        {columns.map((stage) => {
          const list = filtered.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId) return;
                const c = customers.find((x) => x.id === dragId);
                if (c?.stage === "LOST" && (stage === "INITIAL_CONTACT" || stage === "NEW")) return;
                if (stage === "LOST" || stage === "FAILED") {
                  setLostDraft({ id: dragId, category: stage === "FAILED" ? "OTHER" : "CUSTOMER_WITHDREW", detail: "", _stage: stage } as never);
                  setDragId(null);
                  return;
                }
                moveStage(dragId, stage);
              }}
              className={`w-[276px] shrink-0 rounded-[16px] border p-3 ${STAGE_ACCENT[stage] ?? "border-[var(--line)] bg-white"}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-extrabold tracking-widest text-[var(--ink-2)]">
                  {CUSTOMER_STAGE_LABELS[stage] ?? stage}
                </h3>
                <span className="rounded-full bg-white border border-[var(--line)] px-2 py-0.5 text-[11px] font-bold">{list.length}</span>
              </div>
              <div className="mt-3 h-1 rounded-full bg-white/70 border border-black/5">
                <div className="h-1 rounded-full bg-[var(--ink)]/15" style={{ width: `${Math.min(100, list.length * 18)}%` }} />
              </div>
              <div className="mt-3 space-y-2.5">
                {list.map((c) => {
                  const overdue = c.nextFollowUpAt && new Date(c.nextFollowUpAt) < new Date() && c.stage !== "LOST" && c.stage !== "FAILED" && c.stage !== "WON";
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
                        {c.stage === "LOST" && c.lostReasonCategory && (
                          <div className="mt-1 text-[11px] text-[var(--ink-3)]">
                            {LOST_REASON_LABELS[c.lostReasonCategory] ?? c.lostReasonCategory}
                          </div>
                        )}
                        {c.needsManagerReview && (
                          <div className="mt-2 rounded-full bg-[var(--amber-soft)] border border-[#F1D9A8] px-2 py-1 text-[11px] font-medium text-[var(--amber)]">
                            نیاز به بررسی مدیر
                          </div>
                        )}
                        <div className="mt-2 flex items-center gap-1.5">
                          {overdue ? (
                            <Badge className="bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)] text-[11px]">
                              عقب‌افتاده · {formatDate(c.nextFollowUpAt)}
                            </Badge>
                          ) : c.nextFollowUpAt ? (
                            <span className="text-[11px] text-[var(--ink-3)]">پیگیری {formatDate(c.nextFollowUpAt)}</span>
                          ) : (
                            <span className="text-[11px] text-[var(--ink-3)]/60">بدون پیگیری</span>
                          )}
                        </div>
                      </Link>
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[var(--line-2)] bg-white/60 px-3 py-6 text-center text-[12px] text-[var(--ink-3)]">
                    خالی
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
