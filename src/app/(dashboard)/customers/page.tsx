// نقد ۱ و ۳ و ۱۰ — مشتریان با کمک‌کنندهٔ مرکزی (خطا + تلاش دوباره)،
// صفحه‌بندی صادقانه («نمایش ۱۰۰ از ۲۵۰»)، شمارش واقعی ستون‌ها،
// و انتخاب مرحله با کیبورد برای هر کارت (جایگزین کشیدن‌ورهاکردن).
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/Input";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import {
  CUSTOMER_KANBAN_COLUMNS,
  CUSTOMER_SOURCE_LABELS,
  CUSTOMER_SOURCE_OPTIONS,
  CUSTOMER_STAGE_LABELS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPE_CARD,
  CUSTOMER_TYPE_BADGE,
  LOST_REASON_LABELS,
  TEMPERATURE_COLORS,
  TEMPERATURE_LABELS,
  getStaleInfo,
} from "@/lib/constants";
import { cn, formatDate, toFaDigits } from "@/lib/utils";

type Customer = {
  id: string;
  name: string;
  phone: string;
  stage: string;
  type: string;
  temperature: string;
  source: string | null;
  tags: string[];
  lastActivityAt: string | null;
  nextFollowUpAt: string | null;
  needsManagerReview: boolean;
  lostReasonCategory?: string | null;
};

type SourceStat = { source: string | null; total: number; contracts: number };

type LostDraft = { id: string; category: string; detail: string };

const STAGE_ACCENT: Record<string, string> = {
  INITIAL_CONTACT: "border-[#C7D8EE] bg-[#EFF4FF]",
  VIEWING: "border-[#C9D8E8] bg-[#EEF2FF]",
  QUALIFIED: "border-[#F1D9A8] bg-[var(--amber-soft)]",
  CONTRACT: "border-[#BFE8D6] bg-[#EAF7F0]",
  LOST: "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]",
};

/** مراحل قابل انتخاب با کیبورد برای هر کارت */
// «موفق» اینجا نیست — WON فقط از مسیر معامله می‌آید (ثبت معامله قطعی)
const MOVABLE_STAGES = ["INITIAL_CONTACT", "QUALIFIED", "VIEWING", "CONTRACT", "FAILED", "LOST"];

/** مشتری NEW در «تماس اولیه» نشان داده می‌شود */
function kanbanBucket(stage: string): string | null {
  if (stage === "NEW" || stage === "INITIAL_CONTACT") return "INITIAL_CONTACT";
  if (stage === "VIEWING" || stage === "QUALIFIED" || stage === "CONTRACT") return stage;
  return null;
}

const PAGE_SIZE = 100;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);
  const [staleOnly, setStaleOnly] = useState(false);
  const [sourceStats, setSourceStats] = useState<SourceStat[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const { isOwner } = useRole();
  const [filters, setFilters] = useState({
    temperature: "",
    preferredArea: "",
    preferredType: "",
    budgetMin: "",
    budgetMax: "",
    sizeMin: "",
    sizeMax: "",
    followUp: "",
    sort: "followup",
    agentId: "",
    source: "",
    tag: "",
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [lostDraft, setLostDraft] = useState<LostDraft | null>(null);
  const [msg, setMsg] = useState("");

  const buildParams = useCallback(
    (pageNum: number) => {
      const params = new URLSearchParams();
      params.set("page", String(pageNum));
      params.set("limit", String(PAGE_SIZE));
      if (showLost) params.set("showLost", "true");
      if (search.trim()) params.set("search", search.trim());
      if (filters.temperature) params.set("temperature", filters.temperature);
      if (filters.preferredArea) params.set("preferredArea", filters.preferredArea);
      if (filters.preferredType) params.set("preferredType", filters.preferredType);
      if (filters.budgetMin) params.set("budgetMin", filters.budgetMin);
      if (filters.budgetMax) params.set("budgetMax", filters.budgetMax);
      if (filters.sizeMin) params.set("sizeMin", filters.sizeMin);
      if (filters.sizeMax) params.set("sizeMax", filters.sizeMax);
      if (filters.followUp) params.set("followUp", filters.followUp);
      if (filters.sort && filters.sort !== "followup") params.set("sort", filters.sort);
      if (filters.agentId) params.set("agentId", filters.agentId);
      if (filters.source) params.set("source", filters.source);
      if (filters.tag) params.set("tag", filters.tag);
      if (staleOnly) params.set("staleOnly", "true");
      return params.toString();
    },
    [showLost, search, filters, staleOnly]
  );

  const load = useCallback(
    async (pageNum = 1, append = false) => {
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const d = await apiJson<{ customers?: Customer[]; total?: number; stageCounts?: Record<string, number>; sourceStats?: SourceStat[] } | Customer[]>(
          `/api/customers?${buildParams(pageNum)}`
        );
        const list = Array.isArray(d) ? d : d.customers ?? [];
        setCustomers((prev) => (append ? [...prev, ...list] : list));
        setTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
        if (!Array.isArray(d) && d.stageCounts) setStageCounts(d.stageCounts);
        if (!Array.isArray(d) && d.sourceStats) setSourceStats(d.sourceStats);
        setPage(pageNum);
      } catch (e) {
        if (!append) setLoadError(errorMessage(e));
        else setMsg(errorMessage(e));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildParams]
  );

  useEffect(() => {
    const t = setTimeout(() => load(1, false), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLost, search, filters, staleOnly]);

  useEffect(() => {
    apiJson<{ regions?: string[]; propertyTypes?: { value: string; label: string }[]; customerTags?: string[] }>("/api/settings")
      .then((d) => {
        if (d.regions) setRegions(d.regions);
        if (d.propertyTypes) setTypes(d.propertyTypes);
        if (d.customerTags) setTags(d.customerTags);
      })
      .catch(() => {});
    apiJson<{ id: string; name: string }[]>("/api/users")
      .then((d) => {
        if (Array.isArray(d)) setAgents(d.map((u) => ({ id: u.id, name: u.name })));
      })
      .catch(() => {});
  }, []);

  const advancedCount =
    (filters.temperature ? 1 : 0) +
    (filters.preferredArea ? 1 : 0) +
    (filters.preferredType ? 1 : 0) +
    (filters.budgetMin || filters.budgetMax ? 1 : 0) +
    (filters.sizeMin || filters.sizeMax ? 1 : 0) +
    (filters.followUp ? 1 : 0) +
    (filters.sort !== "followup" ? 1 : 0) +
    (filters.agentId ? 1 : 0) +
    (filters.source ? 1 : 0) +
    (filters.tag ? 1 : 0);

  function clearFilters() {
    setFilters({
      temperature: "",
      preferredArea: "",
      preferredType: "",
      budgetMin: "",
      budgetMax: "",
      sizeMin: "",
      sizeMax: "",
      followUp: "",
      sort: "followup",
      agentId: "",
      source: "",
      tag: "",
    });
  }

  /** تعداد واقعی یک ستون از شمارش سرور؛ اگر سرور نداده باشد، تعداد کارت‌های بارگذاری‌شده */
  function bucketTotal(stage: string): number | null {
    if (Object.keys(stageCounts).length === 0) return null;
    if (stage === "INITIAL_CONTACT") return (stageCounts.NEW ?? 0) + (stageCounts.INITIAL_CONTACT ?? 0);
    return stageCounts[stage] ?? 0;
  }

  async function moveStage(id: string, newStage: string) {
    if (!newStage) return;
    if (newStage === "LOST") {
      setLostDraft({ id, category: "CUSTOMER_WITHDREW", detail: "" });
      return;
    }
    setMsg("");
    try {
      await apiFetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      setDragId(null);
      load(1, false);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  async function confirmLost() {
    if (!lostDraft) return;
    setMsg("");
    try {
      await apiFetch(`/api/customers/${lostDraft.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: "LOST",
          lostReasonCategory: lostDraft.category,
          lostReasonDetail: lostDraft.detail || null,
        }),
      });
      setLostDraft(null);
      setDragId(null);
      load(1, false);
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  const columns = showLost
    ? [...CUSTOMER_KANBAN_COLUMNS, "LOST" as const]
    : [...CUSTOMER_KANBAN_COLUMNS];

  const filtered = customers;
  const hasMore = customers.length < total;

  if (loading && customers.length === 0) return <PageSkeleton rows={4} />;
  if (loadError && customers.length === 0) return <PageError message={loadError} onRetry={() => load(1, false)} />;

  return (
    <div>
      <Header
        title="مشتریان"
        subtitle="خط فروش — تماس اولیه · بازدید · مذاکره · قرارداد"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
              {showAdvanced ? "▲" : "▼"} جستجوی پیشرفته
              {advancedCount > 0 ? ` (${toFaDigits(String(advancedCount))})` : ""}
            </Button>
            <Input
              placeholder="جستجوی نام یا شماره..."
              aria-label="جستجوی نام یا شماره"
              className="w-full sm:w-[200px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="hidden sm:flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
              <input type="checkbox" checked={showLost} onChange={(e) => setShowLost(e.target.checked)} /> بایگانی
            </label>
            <label className="hidden sm:flex items-center gap-2 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2 text-[12px]">
              <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} /> فقط راکدها
            </label>
            <Link href="/customers/new"><Button>＋ مشتری جدید</Button></Link>
          </div>
        }
      />
      {total > 0 && (
        <div className="mx-4 sm:mx-6 mt-3 text-[12px] text-[var(--ink-3)]">
          نمایش {toFaDigits(String(customers.length))} از {toFaDigits(String(total))} مشتری
        </div>
      )}
      {sourceStats.length > 0 && (
        <div className="mx-4 sm:mx-6 mt-2 flex flex-wrap gap-1.5">
          {sourceStats.map((s) => (
            <span key={s.source ?? "none"} className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] text-[var(--ink-2)]">
              {s.source ? (CUSTOMER_SOURCE_LABELS[s.source] ?? s.source) : "بدون منبع"}: {toFaDigits(String(s.total))} مشتری · {toFaDigits(String(s.contracts))} قرارداد
            </span>
          ))}
        </div>
      )}
      {msg && <div className="mx-4 sm:mx-6 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{msg}</div>}

      {showAdvanced && (
        <div className="mx-4 mt-3 rounded-[14px] border border-[var(--line)] bg-white p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={filters.temperature} onChange={(e) => setFilters({ ...filters, temperature: e.target.value })}>
              <option value="">دمای مشتری (همه)</option>
              <option value="HOT">داغ</option>
              <option value="WARM">گرم</option>
              <option value="COLD">سرد</option>
            </Select>
            <Select value={filters.preferredArea} onChange={(e) => setFilters({ ...filters, preferredArea: e.target.value })}>
              <option value="">منطقه موردنظر (همه)</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
            <Select value={filters.preferredType} onChange={(e) => setFilters({ ...filters, preferredType: e.target.value })}>
              <option value="">نوع ملک موردنظر (همه)</option>
              {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select value={filters.followUp} onChange={(e) => setFilters({ ...filters, followUp: e.target.value })}>
              <option value="">پیگیری (همه)</option>
              <option value="overdue">عقب‌افتاده</option>
              <option value="today">امروز</option>
              <option value="none">بدون پیگیری</option>
            </Select>
            <Select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })}>
              <option value="">شیوه آشنایی (همه)</option>
              {CUSTOMER_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s] ?? s}</option>)}
            </Select>
            <Select value={filters.tag} onChange={(e) => setFilters({ ...filters, tag: e.target.value })}>
              <option value="">برچسب (همه)</option>
              {tags.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
              <option value="followup">پیگیری (پیش‌فرض)</option>
              <option value="newest">جدیدترین</option>
              <option value="name">نام (الفبا)</option>
            </Select>
            {isOwner && (
              <Select value={filters.agentId} onChange={(e) => setFilters({ ...filters, agentId: e.target.value })}>
                <option value="">همه مشاورها</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            )}
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-1.5">
              <Input inputMode="numeric" dir="ltr" placeholder="بودجه از" value={filters.budgetMin} onChange={(e) => setFilters({ ...filters, budgetMin: e.target.value.replace(/[^0-9]/g, "") })} />
              <span className="text-[var(--ink-3)]">تا</span>
              <Input inputMode="numeric" dir="ltr" placeholder="بودجه تا" value={filters.budgetMax} onChange={(e) => setFilters({ ...filters, budgetMax: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
            <div className="flex items-center gap-1.5">
              <Input inputMode="numeric" dir="ltr" placeholder="متراژ از" value={filters.sizeMin} onChange={(e) => setFilters({ ...filters, sizeMin: e.target.value.replace(/[^0-9]/g, "") })} />
              <span className="text-[var(--ink-3)]">تا</span>
              <Input inputMode="numeric" dir="ltr" placeholder="متراژ تا" value={filters.sizeMax} onChange={(e) => setFilters({ ...filters, sizeMax: e.target.value.replace(/[^0-9]/g, "") })} />
            </div>
            <div className="flex items-center">
              <Button variant="outline" size="sm" onClick={clearFilters}>پاک کردن فیلتر</Button>
            </div>
          </div>
        </div>
      )}

      {lostDraft && (
        <div className="mx-4 sm:mx-6 mt-3 rounded-[14px] border border-[var(--line)] bg-white p-4">
          <div className="text-[13px] font-bold mb-2">بایگانی — دلیل را انتخاب کنید</div>
          <div className="flex flex-wrap gap-2 items-end">
            <select
              aria-label="دلیل بایگانی"
              className="w-full sm:w-[220px] rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5 text-[13px]"
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
          const totalForColumn = bucketTotal(stage);
          const shownForColumn = totalForColumn ?? list.length;
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
                <span className="rounded-full bg-white border border-[var(--line)] px-2 py-0.5 text-[11px] font-bold">{toFaDigits(String(shownForColumn))}</span>
              </div>
              {totalForColumn !== null && list.length < totalForColumn && (
                <div className="mt-1 text-[11px] text-[var(--ink-3)]">نمایش {toFaDigits(String(list.length))} از {toFaDigits(String(totalForColumn))} — دکمهٔ «بارگذاری بیشتر» پایین صفحه</div>
              )}
              <div className="mt-3 space-y-2.5">
                {list.map((c) => {
                  const overdue =
                    c.nextFollowUpAt &&
                    new Date(c.nextFollowUpAt) < new Date() &&
                    !["LOST", "FAILED", "WON", "CONTRACT"].includes(c.stage);
                  const stale = getStaleInfo(c.stage, c.lastActivityAt);
                  const cardTags = c.tags ?? [];
                  return (
                    <div
                      key={c.id}
                      draggable
                      onDragStart={() => setDragId(c.id)}
                      className={cn(
                        "rounded-[14px] border bg-white p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow",
                        CUSTOMER_TYPE_CARD[c.type] ?? "border-[var(--line)]",
                        overdue && "border-[var(--pomegranate-line)]"
                      )}
                    >
                      <Link href={`/customers/${c.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${TEMPERATURE_COLORS[c.temperature] ?? "bg-zinc-300"}`} title={TEMPERATURE_LABELS[c.temperature] ?? c.temperature} />
                          <span className="text-[13.5px] font-bold leading-none truncate">{c.name}</span>
                          <Badge className={`shrink-0 text-[10.5px] ${CUSTOMER_TYPE_BADGE[c.type] ?? ""}`}>{CUSTOMER_TYPE_LABELS[c.type] ?? c.type}</Badge>
                        </div>
                        <div className="mt-1 text-[11px] tracking-wide text-[var(--ink-3)]" dir="ltr">{c.phone}</div>
                        {cardTags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {cardTags.slice(0, 2).map((t) => (
                              <span key={t} className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[10.5px] text-[var(--ink-2)]">{t}</span>
                            ))}
                            {cardTags.length > 2 && (
                              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[10.5px] text-[var(--ink-3)]">+{toFaDigits(String(cardTags.length - 2))}</span>
                            )}
                          </div>
                        )}
                        {stale && (
                          <div className="mt-2">
                            <Badge className="bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)] text-[11px]">
                              راکد — {toFaDigits(String(stale.days))} روز بدون فعالیت
                            </Badge>
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
                      {/* جایگزین کیبورد برای کشیدن‌ورهاکردن (نقد ۱۰) */}
                      <div className="mt-2" onDragStart={(e) => e.preventDefault()}>
                        <label className="sr-only" htmlFor={`stage-${c.id}`}>انتقال {c.name} به مرحله</label>
                        <select
                          id={`stage-${c.id}`}
                          aria-label={`انتقال ${c.name} به مرحله`}
                          value={MOVABLE_STAGES.includes(c.stage) ? c.stage : ""}
                          onChange={(e) => moveStage(c.id, e.target.value)}
                          className="w-full rounded-[10px] border border-[var(--line)] bg-[var(--paper-2)] px-2 py-1.5 text-[12px] text-[var(--ink-2)]"
                        >
                          <option value="">انتقال به مرحله...</option>
                          {MOVABLE_STAGES.map((s) => (
                            <option key={s} value={s}>{CUSTOMER_STAGE_LABELS[s] ?? s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && (totalForColumn ?? 0) === 0 && (
                  <div className="rounded-[12px] border border-dashed border-[var(--line-2)] bg-white/60 px-3 py-6 text-center text-[12px] text-[var(--ink-3)]">
                    خالی
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <div className="px-4 pb-6 text-center">
          <Button variant="outline" onClick={() => load(page + 1, true)} disabled={loadingMore}>
            {loadingMore ? "در حال بارگذاری..." : `بارگذاری بیشتر (نمایش ${toFaDigits(String(customers.length))} از ${toFaDigits(String(total))})`}
          </Button>
        </div>
      )}
    </div>
  );
}
