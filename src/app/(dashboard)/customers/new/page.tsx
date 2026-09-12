"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { PhoneInput, NumberInput, Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { Input } from "@/components/ui/Input";
import { formatTomanWithWords } from "@/lib/money";

export default function NewCustomerPage() {
  const router = useRouter();
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({ name: "", phone: "", type: "BUYER", preferredDealType: "", preferredType: "", preferredArea: "", budgetMax: "", nextFollowUpAt: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const body: Record<string, unknown> = { name: form.name, phone: form.phone, type: form.type };
    if (form.preferredDealType) body.preferredDealType = form.preferredDealType;
    if (form.preferredType) body.preferredType = form.preferredType;
    if (form.preferredArea) body.preferredArea = form.preferredArea;
    if (form.budgetMax) body.budgetMax = form.budgetMax;
    if (form.nextFollowUpAt) body.nextFollowUpAt = form.nextFollowUpAt;
    const res = await fetch("/api/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "خطا"); setLoading(false); return; }
    router.push("/customers");
  }

  const budgetWords = form.budgetMax ? formatTomanWithWords(form.budgetMax).words : "";

  return (
    <div>
      <Header title="مشتری جدید" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>نام و نام خانوادگی *</Label><Input value={form.name} onChange={(e) => upd("name", e.target.value)} required placeholder="مثلا رضا کریمی" className="mt-1" /></div>
          <div><Label>شماره تماس *</Label><PhoneInput value={form.phone} onChange={(e) => upd("phone", e.target.value)} required placeholder="09171234567" className="mt-1" /></div>
          <div><Label>نوع</Label><Select value={form.type} onChange={(e) => upd("type", e.target.value)} className="mt-1"><option value="BUYER">خریدار</option><option value="SELLER">فروشنده</option><option value="TENANT">مستاجر</option><option value="OWNER">مالک</option></Select></div>
          <div><Label>نوع معامله</Label><Select value={form.preferredDealType} onChange={(e) => upd("preferredDealType", e.target.value)} className="mt-1"><option value="">—</option><option value="SALE">خرید / فروش</option><option value="RENT">رهن و اجاره</option></Select></div>
          <div><Label>نوع ملک</Label><Select value={form.preferredType} onChange={(e) => upd("preferredType", e.target.value)} className="mt-1"><option value="">—</option>{propertyTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
          <div><Label>منطقه</Label><Select value={form.preferredArea} onChange={(e) => upd("preferredArea", e.target.value)} className="mt-1"><option value="">—</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
          <div>
            <Label>بودجه سقف (تومان)</Label>
            <NumberInput value={form.budgetMax} onChange={(e) => upd("budgetMax", e.target.value)} placeholder="3500000000" className="mt-1" />
            {budgetWords && <p className="mt-1 text-xs text-zinc-500">{budgetWords}</p>}
          </div>
          <div><Label>پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker value={form.nextFollowUpAt || null} onChange={(v) => upd("nextFollowUpAt", v ?? "")} placeholder="انتخاب تاریخ" /></div></div>
        </div>
        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت مشتری"}</Button>
      </form>
    </div>
  );
}
