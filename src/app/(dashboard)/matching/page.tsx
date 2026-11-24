// تطبیق — بخش جداگانه اعلان‌های تطبیق (از صفحه اعلان‌ها جدا شد، ۲۵ آبان):
// فقط MATCH_SUGGESTION، با همان ردیف و همان اقدام‌های صفحه اعلان‌ها
// (خواندن، باز کردن مورد مرتبط). «تماس گرفتم» مال ردیف‌های پیگیری است
// و برای تطبیق در صفحه اعلان‌ها هم نبود.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDate, toFaDigits } from "@/lib/utils";
import type { MatchBreakdownItem } from "@/lib/matching";

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "مهم",
  NORMAL: "معمولی",
  LOW: "کم‌اهمیت",
};

type NotificationRow = {
  id: string;
  message: string;
  type: string;
  priority: string;
  read: boolean;
  createdAt: string;
  relatedId: string | null;
  relatedType: string | null;
};

type MatchItem = {
  id: string;
  kind: "Property" | "Customer";
  label: string;
  sub: string | null;
  score: number;
  reasons: string[];
  breakdown: MatchBreakdownItem[];
};

// Dropdown of live matches next to the view button: matched files for a
// customer card, matched customers for a property card. Fetched lazily
// from /api/matching when opened, so the list never shows deleted items.
// Each match shows its explained score (which criteria fit/miss) and a
// «not interested» dismissal.
function MatchDropdown({ relatedType, relatedId }: { relatedType: string; relatedId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<MatchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const isCustomer = relatedType === "Customer";
  const label = isCustomer ? "فایل\u200Cهای تطبیق\u200Cخورده" : "مشتری\u200Cهای تطبیق\u200Cخورده";

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (items !== null) return;
    setLoading(true);
    setError("");
    try {
      const q = isCustomer ? `customerId=${relatedId}` : `propertyId=${relatedId}`;
      const d = await apiJson<{ matches?: MatchItem[] }>(`/api/matching?${q}`);
      setItems(d.matches ?? []);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function dismissMatch(m: MatchItem) {
    setActionError("");
    setActionMsg("");
    const customerId = isCustomer ? relatedId : m.id;
    const propertyId = isCustomer ? m.id : relatedId;
    try {
      await apiFetch("/api/matching/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, propertyId }),
      });
      setItems((prev) => (prev ?? []).filter((x) => x.id !== m.id));
      setActionMsg("تطبیق رد شد و از لیست پنهان شد.");
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
      >
        {label} ▾
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 max-h-96 w-80 overflow-auto rounded-lg border border-[var(--line)] bg-white shadow-lg">
          {loading && <p className="px-3 py-2 text-xs text-zinc-400">در حال بارگذاری…</p>}
          {error && <p className="px-3 py-2 text-xs text-red-600" role="alert">{error}</p>}
          {actionError && <p className="px-3 py-2 text-xs text-red-600" role="alert">{actionError}</p>}
          {actionMsg && <p className="px-3 py-2 text-xs text-emerald-700">{actionMsg}</p>}
          {!loading && !error && items !== null && items.length === 0 && (
            <p className="px-3 py-2 text-xs text-zinc-400">تطبیقی نیست</p>
          )}
          {!loading && !error && items?.map((m) => (
            <div key={m.id} className="border-b border-[var(--line)] last:border-0">
              <Link
                href={m.kind === "Property" ? `/properties/${m.id}` : `/customers/${m.id}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 hover:bg-amber-50"
              >
                <span className="flex items-center justify-between gap-2 text-xs font-medium text-[var(--ink)]">
                  <span className="truncate">{m.label}{m.sub ? ` · ${m.sub}` : ""}</span>
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">{m.score}٪</span>
                </span>
                {m.breakdown && m.breakdown.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {m.breakdown.map((b) => (
                      <span
                        key={b.key}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                          b.fit === "fit"
                            ? "bg-emerald-100 text-emerald-800"
                            : b.fit === "miss"
                              ? "bg-red-100 text-red-800"
                              : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {b.label} {b.fit === "fit" ? "✓" : b.fit === "miss" ? "✗" : "—"}
                        {b.points > 0 ? ` · ${toFaDigits(String(b.points))}` : ""}
                      </span>
                    ))}
                  </span>
                )}
                {m.reasons.length > 0 && (
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-400">{m.reasons.join("، ")}</span>
                )}
              </Link>
              <div className="flex flex-wrap gap-2 px-3 pb-2">
                <button
                  type="button"
                  onClick={() => void dismissMatch(m)}
                  className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50"
                >
                  {"علاقه\u200Cای ندارد"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MatchingPage() {
  const router = useRouter();
  const [list, setList] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await apiJson<{ notifications?: NotificationRow[] }>("/api/notifications?limit=100&type=MATCH_SUGGESTION");
      setList(d.notifications ?? []);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // بارگذاری اولیهٔ داده — الگوی استاندارد صفحه‌های کلاینتی
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markAll() {
    setActionError("");
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true, type: "MATCH_SUGGESTION" }),
      });
      // آپدیت خوش‌بینانهٔ لیست محلی — load() دوباره کل صفحه را اسکلتون می‌کرد
      setList((prev) => prev.map((n) => ({ ...n, read: true })));
      // بج تطبیق در سایدبار از لی‌اوت سروری می‌آید؛ بدون رفرش، عددش کهنه می‌ماند.
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function markOne(id: string) {
    setActionError("");
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      // آپدیت خوش‌بینانهٔ لیست محلی — load() دوباره کل صفحه را اسکلتون می‌کرد
      setList((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      // بج تطبیق در سایدبار از لی‌اوت سروری می‌آید؛ بدون رفرش، عددش کهنه می‌ماند.
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <PageError message={loadError} onRetry={load} />;

  return (
    <div>
      <Header title="تطبیق" action={<Button variant="outline" onClick={markAll}>همه خوانده شد</Button>} />
      <div className="p-4 sm:p-6 max-w-[1200px] space-y-3">
        {actionError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionError}</div>
        )}
        {list.length === 0 ? <p className="text-zinc-400">تطبیقی ندارید</p> : (<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{list.map((n) => (
          <Card key={n.id} className={n.read ? "bg-[var(--paper-2)]" : "border-amber-200 bg-amber-50/30"}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-1"><Badge className={n.priority === "HIGH" ? "bg-red-100 text-red-700 border-red-200" : ""}>{PRIORITY_LABELS[n.priority] ?? n.priority}</Badge><Badge>تطبیق</Badge></div>
                <p className="text-sm break-words">{n.message}</p>
                <p className="text-xs text-zinc-400 mt-1">{formatDate(n.createdAt)}</p>
                {n.relatedId && n.relatedType && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Link
                      href={n.relatedType === "Property" ? `/properties/${n.relatedId}` : n.relatedType === "Customer" ? `/customers/${n.relatedId}` : "/viewings"}
                      className="inline-block rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                    >
                      {n.relatedType === "Property" ? "مشاهده فایل" : n.relatedType === "Customer" ? "مشاهده مشتری" : "مشاهده بازدیدها"}
                    </Link>
                    {(n.relatedType === "Customer" || n.relatedType === "Property") && (
                      <MatchDropdown relatedType={n.relatedType} relatedId={n.relatedId} />
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {!n.read && <Button size="sm" variant="outline" onClick={() => markOne(n.id)}>خواندم</Button>}
              </div>
            </div>
          </Card>
        ))}</div>)}
      </div>
    </div>
  );
}
