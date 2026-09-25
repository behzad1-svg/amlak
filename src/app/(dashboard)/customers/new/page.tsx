"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PhoneInput, Select, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { Input } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";

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
  const [role, setRole] = useState<string>("");
  const [form, setForm] = useState<Record<string, string>>({ name: "", phone: "", type: "BUYER", preferredDealType: "", preferredType: "", budgetMax: "", budgetMaxMonthly: "", nextFollowUpAt: "", description: "", preferredSizeMin: "", preferredSizeMax: "", assignedAgentId: "" });
  const [areas, setAreas] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
    });
    fetch("/api/auth/me").then((r) => r.json()).then((d) => {
      const r = d?.user?.role ?? "";
      setRole(r);
      if (r === "OWNER") {
        fetch("/api/users").then((res) => res.json()).then((users) => {
          if (Array.isArray(users)) setAgents(users);
        });
      }
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const dealType = form.preferredDealType;
    const body: Record<string, unknown> = { name: form.name, phone: form.phone, type: form.type, stage: "INITIAL_CONTACT" };
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
    const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "خطا"); setLoading(false); return; }
    router.push("/customers");
  }

  const dealType = form.preferredDealType;

  return (
    <div>
      <Header title="مشتری جدید" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>نام و نام خانوادگی *</Label><Input value={form.name} onChange={(e) => upd("name", e.target.value)} required placeholder="مثلا رضا کریمی" className="mt-1" /></div>
          <div><Label>شماره تماس *</Label><PhoneInput value={form.phone} onChange={(e) => upd("phone", e.target.value)} required placeholder="09171234567" className="mt-1" /></div>
          <div>
            <Label>نوع</Label>
            <Select
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
              <Label>مشاور مسئول</Label>
              <Select value={form.assignedAgentId} onChange={(e) => upd("assignedAgentId", e.target.value)} className="mt-1">
                <option value="">خودم (مدیر)</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.role === "OWNER" ? " (مدیر)" : ""}</option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>نوع معامله *</Label>
            <Select
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
          <div><Label>نوع ملک</Label><Select value={form.preferredType} onChange={(e) => upd("preferredType", e.target.value)} className="mt-1"><option value="">—</option>{propertyTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
          <div><Label>متراژ از</Label><Input inputMode="numeric" dir="ltr" value={form.preferredSizeMin} onChange={(e) => upd("preferredSizeMin", e.target.value.replace(/[^0-9]/g, ""))} placeholder="مثلا 80" className="mt-1" /></div>
          <div><Label>متراژ تا</Label><Input inputMode="numeric" dir="ltr" value={form.preferredSizeMax} onChange={(e) => upd("preferredSizeMax", e.target.value.replace(/[^0-9]/g, ""))} placeholder="مثلا 120" className="mt-1" /></div>

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
          <div className="md:col-span-2"><Label>توضیحات</Label><Textarea value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="توضیحات کلی درباره مشتری..." rows={3} className="mt-1" /></div>
          <div><Label>پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker value={form.nextFollowUpAt || null} onChange={(v) => upd("nextFollowUpAt", v ?? "")} placeholder="انتخاب تاریخ" /></div></div>
        </div>
        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت مشتری"}</Button>
      </form>
    </div>
  );
}
