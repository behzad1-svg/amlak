"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label, NumberInput } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDate, formatToman, toEnDigits, toFaDigits } from "@/lib/utils";

type Summary = {
  isOwner: boolean;
  cashboxBalance: string | null;
  cashboxIn: string;
  cashboxOut: string;
  commissionTotal: string;
  commissionPaid: string;
  commissionUnpaid: string;
  unpaidCount: number;
  dealsCompleted: number;
  dealsWithCommission: number;
};

type CommissionDeal = {
  id: string;
  status: string;
  contractAt: string | null;
  createdAt: string;
  commissionToman: string | null;
  commissionPercent: number | null;
  commissionPaid: boolean;
  commissionPaidAt: string | null;
  dealSalePriceToman: string | null;
  dealDepositToman: string | null;
  dealMonthlyRentToman: string | null;
  customer: { id: string; name: string; phone: string };
  property: { id: string; title: string; dealType: string; region: string };
  agent: { id: string; name: string };
};

type CashboxEntry = {
  id: string;
  type: "IN" | "OUT";
  amount: string;
  title: string;
  note: string | null;
  occurredAt: string;
  createdBy: { id: string; name: string };
};

type AgentRow = {
  id: string;
  name: string;
  role: string;
  dealsCompleted: number;
  dealsWithCommission: number;
  saleVolume: string;
  commissionTotal: string;
  commissionPaid: string;
  commissionUnpaid: string;
};

type AgentsData = {
  users: AgentRow[];
  totals: {
    dealsCompleted: number;
    dealsWithCommission: number;
    saleVolume: string;
    commissionTotal: string;
    commissionPaid: string;
    commissionUnpaid: string;
  };
};

const DEAL_STATUS: Record<string, string> = {
  PENDING: "در جریان",
  COMPLETED: "قطعی",
  CANCELED: "لغوشده",
};

const DEAL_TYPE: Record<string, string> = { SALE: "فروش", RENT: "اجاره" };

type Tab = "summary" | "commissions" | "followups" | "cashbox" | "agents";

const TABS: { key: Tab; label: string; ownerOnly: boolean }[] = [
  { key: "summary", label: "خلاصه", ownerOnly: false },
  { key: "commissions", label: "کمیسیون‌ها", ownerOnly: false },
  { key: "followups", label: "پیگیری دریافتی‌ها", ownerOnly: false },
  { key: "cashbox", label: "صندوق دفتر", ownerOnly: true },
  { key: "agents", label: "گزارش مشاوران", ownerOnly: true },
];

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

export default function AccountingPage() {
  const { isOwner, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commissions, setCommissions] = useState<CommissionDeal[]>([]);
  // تب «پیگیری دریافتی‌ها» فهرست خودش را دارد (paid=unpaid) و از فیلتر تب کمیسیون‌ها اثر نمی‌پذیرد
  const [unpaid, setUnpaid] = useState<CommissionDeal[]>([]);
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [cashbox, setCashbox] = useState<{ entries: CashboxEntry[]; balance: string } | null>(null);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  // فرم ویرایش قیمت و کمیسیون (فقط مدیر، در تب کمیسیون‌ها)
  const [editingDeal, setEditingDeal] = useState<CommissionDeal | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDeposit, setEditDeposit] = useState("");
  const [editRent, setEditRent] = useState("");
  const [editPercent, setEditPercent] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // فرم صندوق
  const [entryType, setEntryType] = useState<"IN" | "OUT">("IN");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, c, u] = await Promise.all([
        apiJson<Summary>("/api/accounting/summary"),
        apiJson<CommissionDeal[]>(`/api/accounting/commissions?paid=${paidFilter}`),
        apiJson<CommissionDeal[]>("/api/accounting/commissions?paid=unpaid"),
      ]);
      setSummary(s);
      setCommissions(c);
      setUnpaid(u);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [paidFilter]);

  const loadCashbox = useCallback(async () => {
    setTabLoading(true);
    setLoadError(null);
    try {
      setCashbox(await apiJson<{ entries: CashboxEntry[]; balance: string }>("/api/accounting/cashbox"));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setTabLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setTabLoading(true);
    setLoadError(null);
    try {
      setAgents(await apiJson<AgentsData>("/api/accounting/agents"));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (tab === "cashbox" && !cashbox) loadCashbox();
    if (tab === "agents" && !agents) loadAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!editingDeal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingDeal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingDeal]);

  async function toggleSettle(deal: CommissionDeal) {
    setActionError(null);
    setSettlingId(deal.id);
    try {
      await apiFetch(`/api/accounting/commissions/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPaid: !deal.commissionPaid }),
      });
      await loadBase();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSettlingId(null);
    }
  }

  function openEdit(deal: CommissionDeal) {
    // معامله تسویه‌شده قفل است — دکمه ویرایش برایش نشان داده نمی‌شود؛ اینجا هم سد دوم است
    if (deal.commissionPaid) return;
    setEditingDeal(deal);
    setEditPrice(deal.dealSalePriceToman ?? "");
    setEditDeposit(deal.dealDepositToman ?? "");
    setEditRent(deal.dealMonthlyRentToman ?? "");
    setEditPercent(deal.commissionPercent != null ? String(deal.commissionPercent) : "");
    setEditAmount(deal.commissionToman ?? "");
    setEditError("");
  }

  // محاسبه خودکار مبلغ کمیسیون از درصد × قیمت فروش (فقط فروش؛ اجاره دستی است).
  // فقط موقع تایپ قیمت یا درصد حساب می‌شود، پس مبلغ دستیِ ذخیره‌شده با باز شدن فرم عوض نمی‌شود.
  function calcCommissionAmount(price: string, percent: string): string | null {
    if (price === "" || percent === "") return null;
    const p = Number(price);
    const pc = Number(percent);
    if (!Number.isFinite(p) || !Number.isFinite(pc) || pc < 0 || pc > 100 || p <= 0) return null;
    return String(Math.round((p * pc) / 100));
  }

  function onEditPrice(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditPrice(clean);
    if (editingDeal?.property.dealType === "SALE") {
      const next = calcCommissionAmount(clean, editPercent);
      if (next !== null) setEditAmount(next);
    }
  }

  function onEditPercent(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditPercent(clean);
    if (editingDeal?.property.dealType === "SALE") {
      const next = calcCommissionAmount(editPrice, clean);
      if (next !== null) setEditAmount(next);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeal) return;
    setEditError("");
    if (editPercent !== "") {
      const pct = Number(editPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setEditError("درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
    }
    setEditSaving(true);
    try {
      const isSale = editingDeal.property.dealType === "SALE";
      const body: Record<string, unknown> = {
        commissionPercent: editPercent === "" ? null : Number(editPercent),
        commissionToman: editAmount === "" ? null : toEnDigits(editAmount).replace(/[^0-9]/g, ""),
      };
      if (isSale) body.dealSalePriceToman = editPrice === "" ? null : toEnDigits(editPrice).replace(/[^0-9]/g, "");
      else {
        body.dealDepositToman = editDeposit === "" ? null : toEnDigits(editDeposit).replace(/[^0-9]/g, "");
        body.dealMonthlyRentToman = editRent === "" ? null : toEnDigits(editRent).replace(/[^0-9]/g, "");
      }
      await apiFetch(`/api/deals/${editingDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditingDeal(null);
      await loadBase();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setSavingEntry(true);
    try {
      await apiFetch("/api/accounting/cashbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: entryType,
          amount: toEnDigits(entryAmount).replace(/[^0-9]/g, ""),
          title: entryTitle,
          note: entryNote || null,
          occurredAt: entryDate ? new Date(entryDate).toISOString() : null,
        }),
      });
      setEntryAmount("");
      setEntryTitle("");
      setEntryNote("");
      setEntryDate("");
      await loadCashbox();
      await loadBase();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingEntry(false);
    }
  }

  if (roleLoading) return <PageSkeleton rows={4} />;
  if (loading) return <PageSkeleton rows={4} />;
  if (loadError && !summary) return <PageError message={loadError} onRetry={loadBase} />;

  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwner);

  return (
    <div>
      <Header
        title="حسابداری"
        subtitle="کمیسیون معامله‌ها، پیگیری دریافتی‌ها و صندوق دفتر — مشتری، مالک و مشاور همان‌هایی هستند که در CRM ثبت شده‌اند"
      />
      <div className="p-4 sm:p-6 space-y-6 max-w-[1200px]">
        {actionError && (
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{actionError}</div>
        )}

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "outline"} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>

        {tab === "summary" && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {isOwner && (
              <>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">موجودی صندوق</div>
                  <div className="text-[20px] font-extrabold">{formatToman(summary.cashboxBalance)}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">ورودی صندوق</div>
                  <div className="text-[20px] font-extrabold text-emerald-600">{formatToman(summary.cashboxIn)}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">خروجی صندوق</div>
                  <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.cashboxOut)}</div>
                </div>
              </>
            )}
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">مجموع کمیسیون</div>
              <div className="text-[20px] font-extrabold">{formatToman(summary.commissionTotal)}</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">کمیسیون پرداخت‌شده</div>
              <div className="text-[20px] font-extrabold text-emerald-600">{formatToman(summary.commissionPaid)}</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">کمیسیون پرداخت‌نشده</div>
              <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.commissionUnpaid)}</div>
              <div className="text-[12px] text-[var(--ink-3)]">{toFaDigits(String(summary.unpaidCount))} مورد در انتظار تسویه</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">معامله قطعی</div>
              <div className="text-[20px] font-extrabold">{toFaDigits(String(summary.dealsCompleted))}</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">معامله با کمیسیون</div>
              <div className="text-[20px] font-extrabold">{toFaDigits(String(summary.dealsWithCommission))}</div>
            </div>
          </div>
        )}

        {(tab === "commissions" || tab === "followups") && (
          <Card>
            <CardHeader>
              <CardTitle>{tab === "commissions" ? "کمیسیون معامله‌ها" : "پیگیری دریافتی‌ها — کمیسیون‌های پرداخت‌نشده"}</CardTitle>
            </CardHeader>
            {tab === "commissions" && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "همه"],
                    ["paid", "پرداخت‌شده"],
                    ["unpaid", "پرداخت‌نشده"],
                  ] as const
                ).map(([v, label]) => (
                  <Button key={v} size="sm" variant={paidFilter === v ? "primary" : "outline"} onClick={() => setPaidFilter(v)}>
                    {label}
                  </Button>
                ))}
              </div>
            )}
            {tab === "followups" && unpaid.length === 0 && (
              <p className="text-sm text-[var(--ink-3)]">کمیسیون پرداخت‌نشده‌ای نیست؛ همه تسویه شده‌اند.</p>
            )}
            {(tab === "commissions" ? commissions : unpaid).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-zinc-500 text-[12px]">
                      <th className="py-2 text-right">معامله</th>
                      {isOwner && <th className="py-2 text-right">مشاور</th>}
                      <th className="py-2">مبلغ معامله</th>
                      <th className="py-2">کمیسیون</th>
                      <th className="py-2">وضعیت</th>
                      {tab === "followups" && <th className="py-2">از قرارداد</th>}
                      <th className="py-2">تسویه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "commissions" ? commissions : unpaid).map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2.5 pl-2 text-right">
                          <div className="font-medium">{d.property.title}</div>
                          <div className="text-[12px] text-[var(--ink-3)]">
                            {d.customer.name} · {DEAL_TYPE[d.property.dealType] ?? d.property.dealType} · {d.property.region}
                          </div>
                          <div className="text-[12px] text-[var(--ink-3)]">{formatDate(d.contractAt ?? d.createdAt)}</div>
                        </td>
                        {isOwner && <td className="py-2.5 text-right">{d.agent.name}</td>}
                        <td className="py-2.5 text-center">
                          {d.property.dealType === "RENT" ? (
                            <>
                              {formatToman(d.dealDepositToman)}
                              {d.dealMonthlyRentToman && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">
                                  اجاره ماهانه {formatToman(d.dealMonthlyRentToman)}
                                </span>
                              )}
                            </>
                          ) : (
                            formatToman(d.dealSalePriceToman)
                          )}
                        </td>
                        <td className="py-2.5 text-center font-bold">
                          {d.commissionToman == null ? (
                            <span className="font-normal text-[var(--ink-3)]">تعیین نشده</span>
                          ) : (
                            <>
                              {formatToman(d.commissionToman)}
                              {d.commissionPercent != null && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">{toFaDigits(String(d.commissionPercent))}٪</span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="py-2.5 text-center">{DEAL_STATUS[d.status] ?? d.status}</td>
                        {tab === "followups" && (
                          <td className="py-2.5 text-center">
                            <span className="text-red-600 font-bold">{toFaDigits(String(daysSince(d.contractAt ?? d.createdAt)))} روز</span>
                          </td>
                        )}
                        <td className="py-2.5 text-center">
                          {d.commissionToman == null ? (
                            <span className="text-[var(--ink-3)]">—</span>
                          ) : d.commissionPaid ? (
                            <span className="text-emerald-600 font-bold">تسویه شد{isOwner ? ` · ${formatDate(d.commissionPaidAt)}` : ""}</span>
                          ) : (
                            <span className="text-red-600 font-bold">پرداخت‌نشده</span>
                          )}
                          {isOwner && d.commissionToman != null && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" disabled={settlingId === d.id} onClick={() => toggleSettle(d)}>
                                {d.commissionPaid ? "برگرداندن" : "تسویه شد"}
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && d.commissionToman == null && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                                تعیین کمیسیون
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && d.commissionToman != null && !d.commissionPaid && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                                ویرایش
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && d.commissionPaid && (
                            <div className="mt-1 text-[11px] text-[var(--ink-3)]">تسویه شده؛ برای تغییر اول تسویه را برگردان</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "commissions" && commissions.length === 0 && (
              <p className="text-sm text-[var(--ink-3)]">هنوز معامله‌ای ثبت نشده است.</p>
            )}
            <p className="mt-3 text-[12px] text-[var(--ink-3)]">
              قیمت و کمیسیون هر معامله را مدیر در همین‌جا نهایی می‌کند؛ تا پیش از تسویه قابل ویرایش است و پس از تسویه قفل می‌شود.
            </p>
          </Card>
        )}

        {tab === "cashbox" && isOwner && (
          <>
            <Card>
              <CardHeader><CardTitle>ثبت ورودی / خروجی صندوق</CardTitle></CardHeader>
              <form onSubmit={submitEntry} className="space-y-3">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={entryType === "IN" ? "primary" : "outline"} onClick={() => setEntryType("IN")}>
                    ورودی
                  </Button>
                  <Button type="button" size="sm" variant={entryType === "OUT" ? "primary" : "outline"} onClick={() => setEntryType("OUT")}>
                    خروجی
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-[13px]">
                    مبلغ (تومان)
                    <input
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      inputMode="numeric"
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(toEnDigits(e.target.value).replace(/[^0-9]/g, ""))}
                      placeholder="مثلاً ۵۰۰۰۰۰۰"
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    عنوان
                    <input
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      value={entryTitle}
                      onChange={(e) => setEntryTitle(e.target.value)}
                      placeholder="مثلاً دریافت کمیسیون معامله…"
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    تاریخ (اختیاری — پیش‌فرض امروز)
                    <input
                      type="date"
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      value={entryDate}
                      onChange={(e) => setEntryDate(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-[13px]">
                  توضیح (اختیاری)
                  <input
                    className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                    value={entryNote}
                    onChange={(e) => setEntryNote(e.target.value)}
                  />
                </label>
                <Button type="submit" disabled={savingEntry}>
                  {savingEntry ? "در حال ثبت…" : "ثبت در صندوق"}
                </Button>
              </form>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>گردش صندوق {cashbox ? `— موجودی: ${formatToman(cashbox.balance)}` : ""}</CardTitle>
              </CardHeader>
              {tabLoading && !cashbox ? (
                <PageSkeleton rows={3} />
              ) : cashbox && cashbox.entries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-zinc-500 text-[12px]">
                        <th className="py-2 text-right">عنوان</th>
                        <th className="py-2">نوع</th>
                        <th className="py-2">مبلغ</th>
                        <th className="py-2">تاریخ</th>
                        <th className="py-2 text-right">ثبت‌کننده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashbox.entries.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-2.5 pl-2 text-right">
                            <div className="font-medium">{e.title}</div>
                            {e.note && <div className="text-[12px] text-[var(--ink-3)]">{e.note}</div>}
                          </td>
                          <td className="py-2.5 text-center">
                            <span className={e.type === "IN" ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                              {e.type === "IN" ? "ورودی" : "خروجی"}
                            </span>
                          </td>
                          <td className="py-2.5 text-center font-bold">{formatToman(e.amount)}</td>
                          <td className="py-2.5 text-center">{formatDate(e.occurredAt)}</td>
                          <td className="py-2.5 text-right">{e.createdBy.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--ink-3)]">هنوز ورودی یا خروجی‌ای در صندوق ثبت نشده است — صندوق از صفر شروع می‌شود.</p>
              )}
            </Card>
          </>
        )}

        {tab === "agents" && isOwner && (
          <Card>
            <CardHeader><CardTitle>گزارش مشاوران — کمیسیون و فروش</CardTitle></CardHeader>
            {tabLoading && !agents ? (
              <PageSkeleton rows={3} />
            ) : agents ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-zinc-500 text-[12px]">
                      <th className="py-2 text-right">مشاور</th>
                      <th className="py-2">قرارداد قطعی</th>
                      <th className="py-2">حجم فروش قطعی</th>
                      <th className="py-2">مجموع کمیسیون</th>
                      <th className="py-2">پرداخت‌شده</th>
                      <th className="py-2">پرداخت‌نشده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-2 font-medium text-right">{u.name} {u.role === "OWNER" ? "(مدیر)" : ""}</td>
                        <td className="text-center">{toFaDigits(String(u.dealsCompleted))}</td>
                        <td className="text-center">{formatToman(u.saleVolume)}</td>
                        <td className="text-center font-bold">{formatToman(u.commissionTotal)}</td>
                        <td className="text-center text-emerald-600">{formatToman(u.commissionPaid)}</td>
                        <td className="text-center">
                          <span className={BigInt(u.commissionUnpaid) > BigInt(0) ? "text-red-600 font-bold" : ""}>{formatToman(u.commissionUnpaid)}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-[var(--paper-2)]">
                      <td className="py-2.5 pr-2 text-right">جمع کل</td>
                      <td className="text-center">{toFaDigits(String(agents.totals.dealsCompleted))}</td>
                      <td className="text-center">{formatToman(agents.totals.saleVolume)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionTotal)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionPaid)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionUnpaid)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : null}
          </Card>
        )}

        {editingDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setEditingDeal(null)} aria-label="بستن" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={editingDeal.commissionToman == null ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
              className="relative w-full max-w-lg rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-xl"
            >
              <h3 className="text-[15px] font-extrabold">
                {editingDeal.commissionToman == null ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
              </h3>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                {editingDeal.property.title} · {editingDeal.customer.name} · {DEAL_TYPE[editingDeal.property.dealType] ?? editingDeal.property.dealType}
              </p>
              <form onSubmit={saveEdit} className="mt-4 space-y-3">
                {editingDeal.property.dealType === "SALE" ? (
                  <MoneyInput
                    label="قیمت فروش معامله (تومان)"
                    value={editPrice}
                    onChange={onEditPrice}
                    placeholder="مثلا ۱۰۰۰۰۰۰۰۰۰۰"
                  />
                ) : (
                  <>
                    <MoneyInput
                      label="ودیعه معامله (تومان)"
                      value={editDeposit}
                      onChange={(v) => setEditDeposit(toEnDigits(v).replace(/[^0-9]/g, ""))}
                      placeholder="مثلا ۵۰۰۰۰۰۰۰۰"
                    />
                    <MoneyInput
                      label="اجاره ماهانه (تومان)"
                      value={editRent}
                      onChange={(v) => setEditRent(toEnDigits(v).replace(/[^0-9]/g, ""))}
                      placeholder="مثلا ۲۰۰۰۰۰۰۰"
                    />
                  </>
                )}
                <div>
                  <Label htmlFor="f-editPercent">درصد کمیسیون (۰ تا ۱۰۰)</Label>
                  <NumberInput
                    id="f-editPercent"
                    className="mt-1"
                    value={editPercent}
                    onChange={(e) => onEditPercent(e.target.value)}
                    placeholder="مثلا ۱"
                  />
                </div>
                <MoneyInput
                  label="مبلغ کمیسیون (تومان)"
                  value={editAmount}
                  onChange={(v) => setEditAmount(toEnDigits(v).replace(/[^0-9]/g, ""))}
                  placeholder="مثلا ۵۰۰۰۰۰۰۰"
                  hint="خالی بماند یعنی بدون کمیسیون"
                />
                <p className="text-[11px] text-[var(--ink-3)]">
                  {editingDeal.property.dealType === "SALE"
                    ? "مبلغ از روی درصد × قیمت فروش حساب می‌شود؛ می‌توانید دستی هم عوضش کنید."
                    : "برای اجاره مبلغ کمیسیون دستی وارد می‌شود."}
                </p>
                {editError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={editSaving}>
                    {editSaving ? "در حال ذخیره..." : "ذخیره"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingDeal(null)} disabled={editSaving}>
                    انصراف
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
