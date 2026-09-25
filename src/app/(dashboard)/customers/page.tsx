"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import {
  CUSTOMER_KANBAN_COLUMNS,
  CUSTOMER_STAGE_LABELS,
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

type LostDraft = { id: string; category: string; detail: string };

const STAGE_ACCENT: Record<string, string> = {
  INITIAL_CONTACT: "border-[#C7D8EE] bg-[#EFF4FF]",
  VIEWING: "border-[#C9D8E8] bg-[#EEF2FF]",
  QUALIFIED: "border-[#F1D9A8] bg-[var(--amber-soft)]",
  CONTRACT: "border-[#BFE8D6] bg-[#EAF7F0]",
  LOST: "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]",
};

/** مشتری NEW در «تماس اولیه» نشان داده می‌شود */
function kanbanBucket(stage: string): string | null {
  if (stage === "NEW" || stage === "INITIAL_CONTACT") return "INITIAL_CONTACT";
  if (stage === "VIEWING" || stage === "QUALIFIED" || stage === "CONTRACT") return stage;
  return null;
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showLost, setShowLost] = useState(false);
  const [search, setSearch] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostDraft, setLostDraft] = useState<LostDraft | null>(null);
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
    if (newStage === "LOST") {
      setLostDraft({ id, category: "CUSTOMER_WITHDREW", detail: "" });
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
    const res = await fetch(`/api/customers/${lostDraft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: "LOST",
        lostReasonCategory: lostDraft.category,
        lostReasonDetail: lostDraft.detail || null,
      }),
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

  const columns = showLost
    ? [...CUSTOMER_KANBAN_COLUMNS, "LOST" as const]
    : [...CUSTOMER_KANBAN_COLUMNS];

  const filtered = customers;

  return (
    <div>
      <Header
        title="مشتریان"
        subtitle="خط فروش — تماس اولیه · بازدید · مذاکره · قرارداد"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="جستجوی نام یا شماره..."
              className="w-[200px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
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
          <div className="text-[13px] font-bold mb-2">بایگانی — دلیل را انتخاب کنید</div>
          <div className="flex flex-wrap gap-2 items-end">
            <select
              className="w-[220px] rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-[13px]"
              value={lostDraft.category}
              onChange={(e) => setLostDraft({ ...lostDraft, category: e.target.value })}
            >
              {Object.entries(LOST_REASON_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
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
          const list = filtered.filter((c) => {
            if (stage === "LOST") return c.stage === "LOST";
            return kanbanBucket(c.stage) === stage;
          });
          return (
            <div
              key={stage}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!dragId) return;
                const c = customers.find((x) => x.id === dragId);
                if (c?.stage === "LOST" && stage === "INITIAL_CONTACT") return;
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
                  const overdue =
                    c.nextFollowUpAt &&
                    new Date(c.nextFollowUpAt) < new Date() &&
                    !["LOST", "FAILED", "WON", "CONTRACT"].includes(c.stage);
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      className={`rounded-[14px] border bg-white p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow ${
                        overdue ? "border-[var(--pomegranate-line)]" : "border-[var(--line)]"
                      }`}
                    >
                      <Link href={`/customers/${c.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${TEMPERATURE_COLORS[c.temperature] ?? "bg-zinc-300"}`} title={TEMPERATURE_LABELS[c.temperature] ?? c.temperature} />
                          <span className="text-[13.5px] font-bold leading-none truncate">{c.name}</span>
                        </div>
                        <div className="mt-1 text-[11px] tracking-wide text-[var(--ink-3)]" dir="ltr">{c.phone}</div>
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
