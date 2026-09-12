"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Input, NumberInput, Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { formatTomanWithWords } from "@/lib/money";

export default function NewPropertyPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<{ id: string; name: string }[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({
    title: "", type: "APARTMENT", dealType: "SALE", region: "بهمنی", ownerId: "",
    salePriceToman: "", depositToman: "", monthlyRentToman: "",
    // General
    sizeSqm: "", builtYear: "", address: "",
    hasParking: "false", hasStorage: "false",
    // Apartment-specific
    floor: "", totalFloors: "", beds: "", unitCount: "", unitSizeSqm: "",
    // Villa / Kolangi
    landSizeSqm: "", buildingAge: "", passageWidth: "", buildingFloors: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    fetch("/api/customers?showLost=true").then((r) => r.json()).then((d) => setOwners(Array.isArray(d) ? d : []));
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) {
        setPropertyTypes(d.propertyTypes);
        if (d.propertyTypes.length && !d.propertyTypes.find((t: {value:string})=>t.value===form.type)) {
          // keep default
        }
      }
    });
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const body: Record<string, unknown> = {
      title: form.title, type: form.type, dealType: form.dealType, region: form.region, ownerId: form.ownerId,
      address: form.address || null,
      builtYear: form.builtYear ? parseInt(form.builtYear) : null,
      floor: form.floor ? parseInt(form.floor) : null,
      totalFloors: form.totalFloors ? parseInt(form.totalFloors) : null,
      beds: form.beds ? parseInt(form.beds) : null,
      hasParking: form.hasParking === "true",
      hasStorage: form.hasStorage === "true",
      // Extended fields (stored as notes-like or direct)
      unitCount: form.unitCount ? parseInt(form.unitCount) : null,
      unitSizeSqm: form.unitSizeSqm ? parseFloat(form.unitSizeSqm) : null,
      landSizeSqm: form.landSizeSqm ? parseFloat(form.landSizeSqm) : null,
      passageWidth: form.passageWidth ? parseFloat(form.passageWidth) : null,
      buildingFloors: form.buildingFloors ? parseInt(form.buildingFloors) : null,
    };
    if (form.dealType === "SALE") body.salePriceToman = form.salePriceToman;
    else { body.depositToman = form.depositToman; body.monthlyRentToman = form.monthlyRentToman; }
    if (form.sizeSqm) body.sizeSqm = parseFloat(form.sizeSqm);
    const res = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "خطا"); setLoading(false); return; }
    router.push("/properties");
  }
  const saleWords = form.salePriceToman ? formatTomanWithWords(form.salePriceToman).words : "";
  const depositWords = form.depositToman ? formatTomanWithWords(form.depositToman).words : "";
  const rentWords = form.monthlyRentToman ? formatTomanWithWords(form.monthlyRentToman).words : "";
  return (
    <div>
      <Header title="فایل جدید" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="grid gap-4 md:grid-cols-2">
          <div><Label>عنوان *</Label><Input value={form.title} onChange={(e) => upd("title", e.target.value)} required className="mt-1" /></div>
          <div><Label>نوع ملک</Label><Select value={form.type} onChange={(e) => upd("type", e.target.value)} className="mt-1">{propertyTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
          <div><Label>نوع معامله</Label><Select value={form.dealType} onChange={(e) => upd("dealType", e.target.value)} className="mt-1"><option value="SALE">خرید / فروش</option><option value="RENT">رهن و اجاره</option></Select></div>
          <div><Label>منطقه *</Label><Select value={form.region} onChange={(e) => upd("region", e.target.value)} className="mt-1">{regions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
          <div><Label>مالک *</Label><Select value={form.ownerId} onChange={(e) => upd("ownerId", e.target.value)} className="mt-1" required><option value="">انتخاب کنید</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></div>
          <div><Label>متراژ</Label><NumberInput value={form.sizeSqm} onChange={(e) => upd("sizeSqm", e.target.value)} placeholder="85.5" className="mt-1" /></div>
          {form.dealType === "SALE"
            ? <div><Label>قیمت فروش (تومان)</Label><NumberInput value={form.salePriceToman} onChange={(e) => upd("salePriceToman", e.target.value)} placeholder="3500000000" className="mt-1" />{saleWords && <p className="mt-1 text-xs text-zinc-500">{saleWords}</p>}</div>
            : <><div><Label>رهن (تومان)</Label><NumberInput value={form.depositToman} onChange={(e) => upd("depositToman", e.target.value)} className="mt-1" />{depositWords && <p className="mt-1 text-xs text-zinc-500">{depositWords}</p>}</div><div><Label>اجاره ماهانه (تومان)</Label><NumberInput value={form.monthlyRentToman} onChange={(e) => upd("monthlyRentToman", e.target.value)} className="mt-1" />{rentWords && <p className="mt-1 text-xs text-zinc-500">{rentWords}</p>}</div></>}
        </div>
        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت فایل"}</Button>
      </form>
    </div>
  );
}
