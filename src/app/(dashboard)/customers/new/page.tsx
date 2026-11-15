"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PhoneInput, Select, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import Link from "next/link";
import { CUSTOMER_SOURCE_LABELS, CUSTOMER_SOURCE_OPTIONS } from "@/lib/constants";

// نقد ۹ — انتخابگر تاریخ تنبل بارگذاری می‌شود
const JalaliDatePicker = dynamic(
  () => import("@/components/ui/JalaliDatePicker").then((m) => m.JalaliDatePicker),
  { ssr: false, loading: () => <div className="h-10 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] animate-pulse" /> }
);

function MultiRegionChips({ regions, value, onChange }: { regions: string[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {value.length === 0 ? <span className="text-[12px] text-[var(--ink-3)]">هیچ منطقه‌ای انتخاب نشده</span> : value.map((r) => (
          <span key={r} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[12px]">
            {r}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== r))} className="text-[var(--ink-3)] hover:text-red-600">×</button>
          </span>
        ))}
      </div>
      <Select value="" onChange={(e) => { const v = e.target.value; if (v && !value.includes(v)) onChange([...value, v]); }} className="mt-1">
        <option value="">افزودن منطقه...</option>
        {regions.filter((r) => !value.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}
      </Select>
    </div>
  );
}

export default function NewCustomerPage() {
  const router = useRouter();
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string; role?: string }[]>([]);
  const { role } = useRole();
  const [form, setForm] = useState<Record<string, string>>({ name: "", phone: "", type: "BUYER", source: "", preferredDealType: "", preferredType: "", budgetMax: "", budgetMaxMonthly: "", nextFollowUpAt: "", description: "", preferredSizeMin: "", preferredSizeMax: "", assignedAgentId: "" });
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // نوع پیش‌فرض از لینک (تب «مالکان» با ?type=OWNER می‌آید)
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    if (t === "OWNER" || t === "BUYER" || t === "SELLER" || t === "TENANT") upd("type", t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiJson<{ regions?: string[]; propertyTypes?: { value: string; label: string }[] }>("/api/settings")
      .then((d) => {
        if (d.regions) setRegions(d.regions);
        if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
      })
      .catch(() => {});
  }, []);
  // هشدار شماره تکراری — با ۳۰۰ میلی‌ثانیه تأخیر، فقط وقتی شماره کامل است
  useEffect(() => {
    const phone = form.phone.trim();
    if (!/^[0-9]{10,15}$/.test(phone)) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiJson<{ customers?: { id: string; name: string; phone: string }[] }>(`/api/customers?search=${encodeURIComponent(phone)}&limit=100&category=${form.type === "OWNER" ? "owners" : "customers"}`)
        .then((d) => {
          if (cancelled) return;
          const list = Array.isArray(d) ? d : (d.customers ?? []);
          const hit = list.find((x) => x.phone === phone);
          setDup(hit ? { id: hit.id, name: hit.name } : null);
        })
        .catch(() => {});
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [form.phone, form.type]);

  useEffect(() => {
    if (role !== "OWNER") return;
    apiJson<{ id: string; name: string; role?: string }[]>("/api/users")
      .then((users) => {
        if (Array.isArray(users)) setAgents(users);
      })
      .catch(() => {});
  }, [role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.source) { setError("شیوه آشنایی را انتخاب کنید"); return; }
    if (dup && !confirm(`این شماره قبلاً برای «${dup.name}» ثبت شده است. باز هم مشتری جدید بسازم؟`)) return;
    setLoading(true);
    const dealType = form.preferredDealType;
    const body: Record<string, unknown> = { name: form.name, phone: form.phone, type: form.type, stage: "INITIAL_CONTACT", source: form.source };
    if (dealType) body.preferredDealType = dealType;
    if (form.preferredType) body.preferredType = form.preferredType;
    if (areas.length > 0) body.preferredAreas = areas;
    // بودجه فقط بر اساس نوع معامله — خرید فقط قیمت، رهن فقط ودیعه + اجاره
    if (dealType === "SALE") {
      if (form.budgetMax) body.budgetMax = form.budgetMax;
    } else if (dealType === "RENT") {
      if (form.budgetMax) body.budgetMax = form.budgetMax; // ودیعه
      if (form.budgetMaxMonthly) body.budgetMaxMonthly = form.budgetMaxMonthly;
    } else {
      if (form.budgetMax) body.budgetMax = form.budgetMax;
    }
    if (form.preferredSizeMin) body.preferredSizeMin = parseFloat(form.preferredSizeMin);
    if (form.preferredSizeMax) body.preferredSizeMax = parseFloat(form.preferredSizeMax);
    if (form.description) body.description = form.description;
    if (form.nextFollowUpAt) body.nextFollowUpAt = form.nextFollowUpAt;
    if (role === "OWNER" && form.assignedAgentId) body.assignedAgentId = form.assignedAgentId;
    try {
      await apiFetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
      return;
    }
    router.push("/customers");
  }

  const dealType = form.preferredDealType;

  return (
    <div>
      <Header title="مشتری جدید" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label htmlFor="f-name">نام و نام خانوادگی *</Label><Input id="f-name" value={form.name} onChange={(e) => upd("name", e.target.value)} required placeholder="مثلا رضا کریمی" className="mt-1" /></div>
          <div><Label htmlFor="f-phone">شماره تماس *</Label><PhoneInput id="f-phone" value={form.phone} onChange={(e) => { upd("phone", e.target.value); setDup(null); }} required placeholder="09171234567" className="mt-1" /></div>
          {dup && (
            <div className="md:col-span-2 rounded-[12px] border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
              ⚠️ این شماره قبلاً برای «{dup.name}» ثبت شده است — همین مشتری است؟{" "}
              <Link href={`/customers/${dup.id}`} className="font-bold underline">مشاهده پروفایل</Link>
            </div>
          )}
          <div>
            <Label htmlFor="f-source">شیوه آشنایی *</Label>
            <Select id="f-source" value={form.source} onChange={(e) => upd("source", e.target.value)} className="mt-1" required>
              <option value="">انتخاب کنید</option>
              {CUSTOMER_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s] ?? s}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-type">نوع</Label>
            <Select id="f-type"
              value={form.type}
              onChange={(e) => {
                const t = e.target.value;
                upd("type", t);
                // پیشنهاد خودکار نوع معامله بر اساس نقش
                if (t === "TENANT") upd("preferredDealType", "RENT");
                if (t === "BUYER" && !form.preferredDealType) upd("preferredDealType", "SALE");
              }}
              className="mt-1"
            >
              <option value="BUYER">خریدار</option>
              <option value="SELLER">فروشنده</option>
              <option value="TENANT">مستاجر</option>
              <option value="OWNER">مالک</option>
            </Select>
          </div>
          {role === "OWNER" && agents.length > 0 && (
            <div>
              <Label htmlFor="f-assignedAgentId">مشاور مسئول</Label>
              <Select id="f-assignedAgentId" value={form.assignedAgentId} onChange={(e) => upd("assignedAgentId", e.target.value)} className="mt-1">
                <option value="">خودم (مدیر)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.role === "OWNER" ? " (مدیر)" : ""}</option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="f-preferredDealType">نوع معامله *</Label>
            <Select id="f-preferredDealType"
              value={form.preferredDealType}
              onChange={(e) => {
                const v = e.target.value;
                upd("preferredDealType", v);
                // با تغییر نوع معامله، فیلد بودجه‌ی نوع دیگر پاک شود
                if (v === "SALE") upd("budgetMaxMonthly", "");
                if (v === "RENT") { /* budgetMax = ودیعه */ }
                if (!v) { upd("budgetMax", ""); upd("budgetMaxMonthly", ""); }
              }}
              className="mt-1"
              required
            >
              <option value="">انتخاب کنید</option>
              <option value="SALE">خرید / فروش</option>
              <option value="RENT">رهن و اجاره</option>
            </Select>
          </div>
          <div><Label htmlFor="f-preferredType">نوع ملک</Label><Select id="f-preferredType" value={form.preferredType} onChange={(e) => upd("preferredType", e.target.value)} className="mt-1"><option value="">—</option>{propertyTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
          <div><Label htmlFor="f-preferredSizeMin">متراژ از</Label><Input id="f-preferredSizeMin" inputMode="numeric" dir="ltr" value={form.preferredSizeMin} onChange={(e) => upd("preferredSizeMin", e.target.value.replace(/[^0-9]/g, ""))} placeholder="مثلا 80" className="mt-1" /></div>
          <div><Label htmlFor="f-preferredSizeMax">متراژ تا</Label><Input id="f-preferredSizeMax" inputMode="numeric" dir="ltr" value={form.preferredSizeMax} onChange={(e) => upd("preferredSizeMax", e.target.value.replace(/[^0-9]/g, ""))} placeholder="مثلا 120" className="mt-1" /></div>

          {/* بودجه — جدا بر اساس نوع معامله */}
          {dealType === "SALE" && (
            <div className="md:col-span-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
              <div className="mb-2 text-[12px] font-bold text-[var(--ink-2)]">بودجه خرید</div>
              <MoneyInput
                label="سقف قیمت خرید (تومان)"
                value={form.budgetMax}
                onChange={(v) => upd("budgetMax", v)}
                placeholder="مثلا 3500000000"
                hint="مبلغ را عددی بنویسید — زیر فیلد خوانده می‌شود"
              />
            </div>
          )}
          {dealType === "RENT" && (
            <div className="md:col-span-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
              <div className="mb-2 text-[12px] font-bold text-[var(--ink-2)]">بودجه رهن و اجاره</div>
              <div className="grid gap-3 md:grid-cols-2">
                <MoneyInput
                  label="سقف ودیعه / رهن (تومان)"
                  value={form.budgetMax}
                  onChange={(v) => upd("budgetMax", v)}
                  placeholder="مثلا 500000000"
                  hint="ودیعه"
                />
                <MoneyInput
                  label="سقف اجاره ماهانه (تومان)"
                  value={form.budgetMaxMonthly}
                  onChange={(v) => upd("budgetMaxMonthly", v)}
                  placeholder="مثلا 15000000"
                  hint="اجاره ماه"
                />
              </div>
            </div>
          )}
          {!dealType && (
            <div className="md:col-span-2 rounded-[12px] border border-dashed border-[var(--line-2)] bg-white px-3 py-3 text-[12px] text-[var(--ink-3)]">
              ابتدا «نوع معامله» را انتخاب کنید تا فیلدهای بودجه درست نمایش داده شوند (خرید ≠ رهن/اجاره).
            </div>
          )}

          <div className="md:col-span-2">
            <Label>مناطق موردنظر (چندتایی)</Label>
            <div className="mt-1"><MultiRegionChips regions={regions} value={areas} onChange={setAreas} /></div>
          </div>
          <div className="md:col-span-2"><Label htmlFor="f-description">توضیحات</Label><Textarea id="f-description" value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="توضیحات کلی درباره مشتری..." rows={3} className="mt-1" /></div>
          <div><Label htmlFor="f-nextFollowUpAt">پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker id="f-nextFollowUpAt" value={form.nextFollowUpAt || null} onChange={(v) => upd("nextFollowUpAt", v ?? "")} placeholder="انتخاب تاریخ" /></div></div>
        </div>
        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت مشتری"}</Button>
      </form>
    </div>
  );
}
