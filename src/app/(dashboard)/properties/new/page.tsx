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
    sizeSqm: "", builtYear: "", address: "",
    hasParking: "false", hasStorage: "false",
    floor: "", totalFloors: "", beds: "", unitCount: "", unitSizeSqm: "",
    landSizeSqm: "", passageWidth: "", buildingFloors: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  useEffect(() => {
    fetch("/api/customers?showLost=true").then((r) => r.json()).then((d) => setOwners(Array.isArray(d) ? d : []));
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
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
  const isApartment = form.type === "APARTMENT" || form.type === "OFFICE";
  const isVillaLand = form.type === "VILLA" || form.type === "KOLANGI" || form.type === "LAND";
  const isShop = form.type === "SHOP" || form.type === "COMMERCIAL";
  return (
    <div>
      <Header title="فایل جدید" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4">
          <h3 className="text-[13px] font-bold mb-3">مشخصات اصلی</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>عنوان *</Label><Input value={form.title} onChange={(e) => upd("title", e.target.value)} required placeholder="مثلا آپارتمان 2خوابه بهمنی" className="mt-1" /></div>
            <div><Label>نوع ملک</Label><Select value={form.type} onChange={(e) => upd("type", e.target.value)} className="mt-1">{propertyTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></div>
            <div><Label>نوع معامله</Label><Select value={form.dealType} onChange={(e) => upd("dealType", e.target.value)} className="mt-1"><option value="SALE">خرید / فروش</option><option value="RENT">رهن و اجاره</option></Select></div>
            <div><Label>منطقه *</Label><Select value={form.region} onChange={(e) => upd("region", e.target.value)} className="mt-1">{regions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
            <div><Label>مالک *</Label><Select value={form.ownerId} onChange={(e) => upd("ownerId", e.target.value)} className="mt-1" required><option value="">انتخاب کنید</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select></div>
            <div><Label>آدرس دقیق</Label><Input value={form.address} onChange={(e) => upd("address", e.target.value)} placeholder="خیابان، کوچه، پلاک..." className="mt-1" /></div>
            {form.dealType === "SALE"
              ? <div><Label>قیمت فروش (تومان)</Label><NumberInput value={form.salePriceToman} onChange={(e) => upd("salePriceToman", e.target.value)} placeholder="3500000000" className="mt-1" />{saleWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{saleWords}</p>}</div>
              : <><div><Label>رهن (تومان)</Label><NumberInput value={form.depositToman} onChange={(e) => upd("depositToman", e.target.value)} className="mt-1" />{depositWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{depositWords}</p>}</div><div><Label>اجاره ماهانه (تومان)</Label><NumberInput value={form.monthlyRentToman} onChange={(e) => upd("monthlyRentToman", e.target.value)} className="mt-1" />{rentWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{rentWords}</p>}</div></>}
          </div>
        </div>
        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4">
          <h3 className="text-[13px] font-bold mb-3">مشخصات ملک {isApartment ? "— آپارتمان" : isVillaLand ? "— ویلا/زمین" : isShop ? "— مغازه" : ""}</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>متراژ کل (متر)</Label><NumberInput value={form.sizeSqm} onChange={(e) => upd("sizeSqm", e.target.value)} placeholder="85.5" className="mt-1" /></div>
            <div><Label>سال ساخت (شمسی)</Label><NumberInput value={form.builtYear} onChange={(e) => upd("builtYear", e.target.value)} placeholder="1398" className="mt-1" /></div>
            {isApartment && <>
              <div><Label>طبقه</Label><NumberInput value={form.floor} onChange={(e) => upd("floor", e.target.value)} placeholder="2" className="mt-1" /></div>
              <div><Label>تعداد طبقات ساختمان</Label><NumberInput value={form.totalFloors} onChange={(e) => upd("totalFloors", e.target.value)} placeholder="4" className="mt-1" /></div>
              <div><Label>تعداد خواب</Label><NumberInput value={form.beds} onChange={(e) => upd("beds", e.target.value)} placeholder="2" className="mt-1" /></div>
              <div><Label>تعداد واحد کل</Label><NumberInput value={form.unitCount} onChange={(e) => upd("unitCount", e.target.value)} placeholder="8" className="mt-1" /></div>
              <div><Label>متراژ واحد (متر)</Label><NumberInput value={form.unitSizeSqm} onChange={(e) => upd("unitSizeSqm", e.target.value)} placeholder="85" className="mt-1" /></div>
            </>}
            {isVillaLand && <>
              <div><Label>متراژ زمین (متر)</Label><NumberInput value={form.landSizeSqm} onChange={(e) => upd("landSizeSqm", e.target.value)} placeholder="250" className="mt-1" /></div>
              <div><Label>عرض گذر (متر)</Label><NumberInput value={form.passageWidth} onChange={(e) => upd("passageWidth", e.target.value)} placeholder="12" className="mt-1" /></div>
              <div><Label>تعداد طبقات بنا</Label><NumberInput value={form.buildingFloors} onChange={(e) => upd("buildingFloors", e.target.value)} placeholder="2" className="mt-1" /></div>
              <div><Label>تعداد خواب</Label><NumberInput value={form.beds} onChange={(e) => upd("beds", e.target.value)} placeholder="3" className="mt-1" /></div>
            </>}
            {isShop && <>
              <div><Label>تعداد اتاق</Label><NumberInput value={form.beds} onChange={(e) => upd("beds", e.target.value)} placeholder="—" className="mt-1" /></div>
              <div><Label>عرض گذر (متر)</Label><NumberInput value={form.passageWidth} onChange={(e) => upd("passageWidth", e.target.value)} placeholder="10" className="mt-1" /></div>
            </>}
            <div className="md:col-span-2 flex gap-4 pt-2">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasParking === "true"} onChange={(e) => upd("hasParking", e.target.checked ? "true" : "false")} /> پارکینگ</label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={form.hasStorage === "true"} onChange={(e) => upd("hasStorage", e.target.checked ? "true" : "false")} /> انباری</label>
            </div>
          </div>
        </div>
        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت فایل"}</Button>
      </form>
    </div>
  );
}
