// کارت جلسه — هماهنگی پیش از قرارداد بین مشاور و مدیر (جایگزین کارت کاغذی دستی):
// مشاور کارت را پر می‌کند، همان لحظه اعلان HIGH برای مدیر می‌رود،
// مدیر تأیید یا لغو می‌کند و نظر می‌گذارد.
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { Input, Select, Textarea, Label } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect, type SearchOption } from "@/components/ui/SearchSelect";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDateTime, formatToman, toFaDigits } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

const JalaliDatePicker = dynamic(
  () => import("@/components/ui/JalaliDatePicker").then((m) => m.JalaliDatePicker),
  { ssr: false }
);

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار بررسی",
  CONFIRMED: "تأیید شد",
  CANCELLED: "لغو شد",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800 border-amber-200",
  CONFIRMED: "bg-green-100 text-green-800 border-green-200",
  CANCELLED: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const STATUS_FILTERS = [
  { key: "all", label: "همه" },
  { key: "PENDING", label: "در انتظار بررسی" },
  { key: "CONFIRMED", label: "تأییدشده" },
  { key: "CANCELLED", label: "لغوشده" },
] as const;

const INTENT_OPTIONS = ["رهن", "خرید", "اجاره", "سکونت خودش", "سایر"];

type SessionCardRow = {
  id: string;
  customer: { id: string; name: string; phone: string };
  property: { id: string; title: string; code: string | null; owner: { id: string; name: string } } | null;
  advisor: { id: string; name: string };
  scheduledAt: string;
  cashAmountToman: string | null;
  intent: string | null;
  sellerShiriniToman: string | null;
  cooperatingAdvisor: { id: string; name: string } | null;
  contractManager: { id: string; name: string } | null;
  depositPaid: boolean | null;
  depositAmountToman: string | null;
  rentAmountToman: string | null;
  paymentTerms: string | null;
  notes: string | null;
  status: string;
  managerNote: string | null;
  createdAt: string;
};

export default function SessionCardsPage() {
  const router = useRouter();
  const { isOwner } = useRole();
  const [list, setList] = useState<SessionCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const [customerOptions, setCustomerOptions] = useState<SearchOption[]>([]);
  const [propertyOptions, setPropertyOptions] = useState<SearchOption[]>([]);
  const [advisorOptions, setAdvisorOptions] = useState<SearchOption[]>([]);
  const [contractManagerOptions, setContractManagerOptions] = useState<SearchOption[]>([]);
  const [propertyTotal, setPropertyTotal] = useState<number | null>(null);
  const [propSearch, setPropSearch] = useState("");
  const [propDealType, setPropDealType] = useState("");
  const [propAdvisorId, setPropAdvisorId] = useState("");
  const [fileAdvisorOptions, setFileAdvisorOptions] = useState<SearchOption[]>([]);
  const propertyIdRef = useRef("");

  const [customerId, setCustomerId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [dateIso, setDateIso] = useState<string | null>(null);
  const [time, setTime] = useState("12:00");
  const [cash, setCash] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [rentAmount, setRentAmount] = useState("");
  const [intent, setIntent] = useState("");
  const [intentOther, setIntentOther] = useState("");
  const [shirini, setShirini] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [cooperatingAdvisorId, setCooperatingAdvisorId] = useState("");
  const [contractManagerId, setContractManagerId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [managerNote, setManagerNote] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await apiJson<SessionCardRow[]>("/api/session-cards?limit=200");
      setList(Array.isArray(d) ? d : []);
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

  useEffect(() => {
    apiJson<{ user?: { id: string } }>("/api/auth/me")
      .then((d) => setMyId(d.user?.id ?? null))
      .catch(() => setMyId(null));
  }, []);

  async function loadOptions() {
    try {
      const [c, u] = await Promise.all([
        apiJson<unknown>("/api/customers?limit=200"),
        apiJson<unknown>("/api/users"),
      ]);
      const customers = (Array.isArray(c) ? c : (c as { customers?: unknown[] }).customers ?? []) as { id: string; name: string; phone?: string }[];
      const users = (Array.isArray(u) ? u : []) as { id: string; name: string; role?: string; active?: boolean; isContractManager?: boolean }[];
      setCustomerOptions(customers.map((x) => ({ id: x.id, label: x.name, sub: x.phone })));
      setAdvisorOptions(users.filter((x) => x.role === "AGENT" && x.active !== false).map((x) => ({ id: x.id, label: x.name })));
      setContractManagerOptions(users.filter((x) => x.isContractManager && x.active !== false).map((x) => ({ id: x.id, label: x.name })));
      setFileAdvisorOptions(users.map((x) => ({ id: x.id, label: x.name })));
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  // جستجوی فایل — سمت سرور (عنوان/کد + نوع معامله + مشاور)، تا سقف ۱۰۰ تایی لیست، گزینه‌های ناسازگار را پنهان نکند
  const loadPropertyOptions = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (propSearch.trim()) params.set("search", propSearch.trim());
    if (propDealType) params.set("dealType", propDealType);
    if (propAdvisorId && isOwner) params.set("listedById", propAdvisorId);
    try {
      const d = await apiJson<{ properties?: { id: string; title: string; code?: string | null }[]; total?: number } | { id: string; title: string; code?: string | null }[]>(`/api/properties?${params.toString()}`);
      const list = (Array.isArray(d) ? d : d.properties ?? []) as { id: string; title: string; code?: string | null }[];
      setPropertyTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
      const opts = list.map((x) => ({ id: x.id, label: x.code ? `${x.code} — ${x.title}` : x.title }));
      // فایل انتخاب‌شده را نگه دار — حتی اگر با فیلتر تازه در لیست نباشد، برچسبش ناپدید نشود
      setPropertyOptions((prev) => {
        const selId = propertyIdRef.current;
        if (!selId) return opts;
        const sel = prev.find((o) => o.id === selId);
        if (sel && !opts.some((o) => o.id === sel.id)) return [...opts, sel];
        return opts;
      });
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }, [propSearch, propDealType, propAdvisorId, isOwner]);

  useEffect(() => {
    propertyIdRef.current = propertyId;
  }, [propertyId]);

  useEffect(() => {
    if (!showForm) return;
    const t = setTimeout(() => {
      loadPropertyOptions();
    }, propSearch.trim() ? 280 : 0);
    return () => clearTimeout(t);
  }, [showForm, propSearch, propDealType, propAdvisorId, loadPropertyOptions]);

  function openForm() {
    setShowForm(true);
    setActionError("");
    if (customerOptions.length === 0 || advisorOptions.length === 0) loadOptions();
  }

  function resetForm() {
    setCustomerId("");
    setPropertyId("");
    setDateIso(null);
    setTime("12:00");
    setCash("");
    setDepositAmount("");
    setRentAmount("");
    setIntent("");
    setIntentOther("");
    setShirini("");
    setDepositPaid("");
    setCooperatingAdvisorId("");
    setContractManagerId("");
    setPaymentTerms("");
    setNotes("");
  }

  async function submit() {
    setActionError("");
    setActionOk("");
    if (!customerId) {
      setActionError("مشتری را انتخاب کنید");
      return;
    }
    if (!dateIso) {
      setActionError("تاریخ جلسه را انتخاب کنید");
      return;
    }
    const [hh, mm] = time.split(":").map((v) => parseInt(v, 10));
    const at = new Date(dateIso);
    at.setHours(Number.isNaN(hh) ? 12 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
    const finalIntent = intent === "سایر" ? intentOther.trim() : intent;
    const isRent = intent === "رهن" || intent === "اجاره";
    setSaving(true);
    try {
      await apiJson("/api/session-cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
          propertyId: propertyId || null,
          scheduledAt: at.toISOString(),
          cashAmountToman: isRent ? null : cash || null,
          depositAmountToman: isRent ? depositAmount || null : null,
          rentAmountToman: isRent ? rentAmount || null : null,
          intent: finalIntent || null,
          sellerShiriniToman: shirini || null,
          cooperatingAdvisorId: cooperatingAdvisorId || null,
          contractManagerId: contractManagerId || null,
          depositPaid: depositPaid === "paid" ? true : depositPaid === "unpaid" ? false : null,
          paymentTerms: paymentTerms.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      resetForm();
      setShowForm(false);
      setActionOk("کارت جلسه ثبت شد و اعلان رفت.");
      load();
      // نشان کارت جلسه در سایدبار از لی‌اوت سروری می‌آید؛ بدون رفرش، عددش کهنه می‌ماند.
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function decide(card: SessionCardRow, status: "CONFIRMED" | "CANCELLED") {
    setActionError("");
    setActionOk("");
    setActingId(card.id);
    try {
      await apiFetch(`/api/session-cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, managerNote: managerNote.trim() || undefined }),
      });
      setManagerNote("");
      setActionOk(status === "CONFIRMED" ? "کارت جلسه تأیید شد." : "کارت جلسه لغو شد.");
      load();
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  async function cancelMine(card: SessionCardRow) {
    setActionError("");
    setActionOk("");
    setActingId(card.id);
    try {
      await apiFetch(`/api/session-cards/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "CANCELLED" }),
      });
      setActionOk("کارت جلسه لغو شد.");
      load();
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setActingId(null);
    }
  }

  const filtered = statusFilter === "all" ? list : list.filter((c) => c.status === statusFilter);

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <PageError message={loadError} onRetry={load} />;

  return (
    <div>
      <Header
        title="کارت جلسه"
        action={
          <Button onClick={() => (showForm ? setShowForm(false) : openForm())}>
            {showForm ? "بستن فرم" : "+ کارت جلسه تازه"}
          </Button>
        }
      />
      <div className="p-4 sm:p-6 space-y-3 max-w-3xl">
        {actionError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionError}</div>
        )}
        {actionOk && (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">{actionOk}</div>
        )}

        {showForm && (
          <Card>
            <div className="space-y-4">
              <p className="text-[13px] leading-6 text-[var(--ink-2)]">
                پیش از قرارداد، شرایط جلسه را اینجا بنویسید تا مدیر پیش از جلسه همه اطلاعات را داشته باشد؛
                به‌محض ثبت، اعلان کارت جلسه برای مدیر می‌رود؛ اگر مشاور همکار یا مدیر قرارداد انتخاب شده باشد، برای آن‌ها هم می‌رود.
              </p>
              <SearchSelect label="مشتری *" required value={customerId} onChange={setCustomerId} options={customerOptions} placeholder="مشتری را جستجو و انتخاب کنید..." />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={propDealType} onChange={(e) => setPropDealType(e.target.value)} aria-label="نوع معامله">
                  <option value="">همه معاملات</option>
                  <option value="SALE">فروش</option>
                  <option value="RENT">رهن و اجاره</option>
                </Select>
                {isOwner && (
                  <Select value={propAdvisorId} onChange={(e) => setPropAdvisorId(e.target.value)} aria-label="مشاور">
                    <option value="">همه مشاورها</option>
                    {fileAdvisorOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </Select>
                )}
              </div>
              <SearchSelect label="فایل / ملک" value={propertyId} onChange={setPropertyId} options={propertyOptions} placeholder="فایل را جستجو و انتخاب کنید..." onSearchChange={setPropSearch} />
              {propertyTotal !== null && propertyTotal > propertyOptions.length && (
                <p className="text-[11px] text-[var(--ink-3)]">
                  نمایش {toFaDigits(String(propertyOptions.length))} از {toFaDigits(String(propertyTotal))} فایل — فیلترها را دقیق‌تر کنید.
                </p>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاریخ جلسه *</Label>
                  <div className="mt-1"><JalaliDatePicker value={dateIso} onChange={setDateIso} placeholder="انتخاب تاریخ" /></div>
                </div>
                <div>
                  <Label htmlFor="sc-time">ساعت جلسه *</Label>
                  <Input id="sc-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="mt-1" dir="ltr" />
                </div>
              </div>
              {(intent === "رهن" || intent === "اجاره") ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <MoneyInput label="مبلغ رهن (تومان)" value={depositAmount} onChange={setDepositAmount} placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰" />
                  <MoneyInput label="اجاره ماهانه (تومان)" value={rentAmount} onChange={setRentAmount} placeholder="مثلاً ۲۰٬۰۰۰٬۰۰۰" />
                </div>
              ) : (
                <MoneyInput label="پول نقد مشتری (تومان)" value={cash} onChange={setCash} placeholder="مثلاً ۵٬۰۰۰٬۰۰۰٬۰۰۰" />
              )}
              <div>
                <Label htmlFor="sc-intent">قصد مشتری</Label>
                <Select id="sc-intent" value={intent} onChange={(e) => setIntent(e.target.value)} className="mt-1">
                  <option value="">انتخاب کنید</option>
                  {INTENT_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </Select>
                {intent === "سایر" && (
                  <Input value={intentOther} onChange={(e) => setIntentOther(e.target.value)} placeholder="قصد مشتری را بنویسید..." className="mt-2" />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <MoneyInput label="شیرینی مالک (تومان)" value={shirini} onChange={setShirini} placeholder="اختیاری" />
                <div>
                  <Label htmlFor="sc-deposit">بیعانه</Label>
                  <Select id="sc-deposit" value={depositPaid} onChange={(e) => setDepositPaid(e.target.value)} className="mt-1">
                    <option value="">انتخاب کنید</option>
                    <option value="paid">پرداخت شده</option>
                    <option value="unpaid">پرداخت نشده</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sc-coop">مشاور همکار (تعاون)</Label>
                  <Select id="sc-coop" value={cooperatingAdvisorId} onChange={(e) => setCooperatingAdvisorId(e.target.value)} className="mt-1">
                    <option value="">انتخاب کنید</option>
                    {advisorOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="sc-cm">مدیر قرارداد</Label>
                  <Select id="sc-cm" value={contractManagerId} onChange={(e) => setContractManagerId(e.target.value)} className="mt-1">
                    <option value="">انتخاب کنید</option>
                    {contractManagerOptions.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="sc-pay">شرایط پرداخت</Label>
                <Textarea id="sc-pay" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="مثلاً نقد، اقساط، چک..." className="mt-1" />
              </div>
              <div>
                <Label htmlFor="sc-notes">توضیح شرایط جلسه</Label>
                <Textarea id="sc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="هر نکته‌ای که مدیر پیش از جلسه باید بداند..." className="mt-1" />
              </div>
              <div className="flex gap-2">
                <Button onClick={submit} disabled={saving}>{saving ? "در حال ثبت..." : "ثبت کارت جلسه"}</Button>
                <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>انصراف</Button>
              </div>
            </div>
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={statusFilter === f.key ? "primary" : "outline"} onClick={() => setStatusFilter(f.key)}>
              {f.label}
              {` (${toFaDigits(String(f.key === "all" ? list.length : list.filter((c) => c.status === f.key).length))})`}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="text-zinc-400">{list.length === 0 ? "کارت جلسه‌ای ندارید" : "در این دسته کارتی نیست"}</p>
        ) : (
          filtered.map((c) => {
            const expanded = expandedId === c.id;
            return (
              <Card key={c.id} className={c.status === "PENDING" ? "border-amber-200 bg-amber-50/30" : ""}>
                <button type="button" onClick={() => setExpandedId(expanded ? null : c.id)} className="w-full text-right">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap gap-2 mb-1">
                        <Badge className={STATUS_BADGE[c.status] ?? ""}>{STATUS_LABELS[c.status] ?? c.status}</Badge>
                        {c.intent && <Badge>{c.intent}</Badge>}
                      </div>
                      <p className="text-sm font-bold">{c.customer.name} <span className="font-normal text-zinc-400" dir="ltr">{c.customer.phone}</span></p>
                      <p className="text-[13px] text-[var(--ink-2)] mt-0.5">
                        {c.property ? `${c.property.code ? `${c.property.code} — ` : ""}${c.property.title}` : "بدون فایل"}
                        {c.property?.owner ? ` · مالک: ${c.property.owner.name}` : ""}
                      </p>
                      <p className="text-xs text-zinc-400 mt-1">
                        جلسه: {formatDateTime(c.scheduledAt)} · سازنده: {c.advisor.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-lg text-zinc-400">{expanded ? "−" : "+"}</span>
                  </div>
                </button>
                {expanded && (
                  <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3 text-[13px]">
                    {c.cashAmountToman && <p>پول نقد مشتری: <b>{formatToman(c.cashAmountToman)}</b></p>}
                    {c.depositAmountToman && <p>مبلغ رهن: <b>{formatToman(c.depositAmountToman)}</b></p>}
                    {c.rentAmountToman && <p>اجاره ماهانه: <b>{formatToman(c.rentAmountToman)}</b></p>}
                    {c.sellerShiriniToman && <p>شیرینی مالک: <b>{formatToman(c.sellerShiriniToman)}</b></p>}
                    {c.depositPaid !== null && c.depositPaid !== undefined && <p>بیعانه: <b>{c.depositPaid ? "پرداخت شده" : "پرداخت نشده"}</b></p>}
                    {c.cooperatingAdvisor && <p>تعاون با: <b>{c.cooperatingAdvisor.name}</b></p>}
                    {c.contractManager && <p>مدیر قرارداد: <b>{c.contractManager.name}</b></p>}
                    {c.paymentTerms && <p>شرایط پرداخت: {c.paymentTerms}</p>}
                    {c.notes && <p className="whitespace-pre-wrap">توضیح شرایط جلسه: {c.notes}</p>}
                    {c.managerNote && <p className="rounded-lg bg-[var(--paper-2)] px-3 py-2">نظر مدیر: {c.managerNote}</p>}
                    {(c.status === "PENDING" || c.status === "CONFIRMED") && isOwner && (
                      <div className="space-y-2 pt-1">
                        <Textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} placeholder="نظر مدیر (اختیاری)..." />
                        <div className="flex gap-2">
                          {c.status === "PENDING" && (
                            <Button size="sm" onClick={() => decide(c, "CONFIRMED")} disabled={actingId === c.id}>تأیید</Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => decide(c, "CANCELLED")} disabled={actingId === c.id}>لغو</Button>
                        </div>
                      </div>
                    )}
                    {(c.status === "PENDING" || c.status === "CONFIRMED") && !isOwner && myId === c.advisor.id && (
                      <div className="pt-1">
                        <Button size="sm" variant="outline" onClick={() => cancelMine(c)} disabled={actingId === c.id}>لغو کارت</Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
