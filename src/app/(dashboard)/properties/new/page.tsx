"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Input, NumberInput, Select, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { formatTomanWithWords } from "@/lib/money";

type Flags = {
  hasParking: boolean;
  hasStorage: boolean;
  hasElevator: boolean;
  hasTerrace: boolean;
  hasRenovated: boolean;
  isNewBuild: boolean;
};

const emptyFlags: Flags = {
  hasParking: false,
  hasStorage: false,
  hasElevator: false,
  hasTerrace: false,
  hasRenovated: false,
  isNewBuild: false,
};

function CheckRow({
  flags,
  onChange,
  keys,
}: {
  flags: Flags;
  onChange: (k: keyof Flags, v: boolean) => void;
  keys: (keyof Flags)[];
}) {
  const labels: Record<keyof Flags, string> = {
    hasParking: "پارکینگ",
    hasStorage: "انباری",
    hasElevator: "آسانسور",
    hasTerrace: "تراس",
    hasRenovated: "بازسازی‌شده",
    isNewBuild: "نوساز",
  };
  return (
    <div className="md:col-span-2 flex flex-wrap gap-x-5 gap-y-2 pt-1">
      {keys.map((k) => (
        <label key={k} className="flex items-center gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" checked={flags[k]} onChange={(e) => onChange(k, e.target.checked)} />
          {labels[k]}
        </label>
      ))}
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <NumberInput value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
    </div>
  );
}

export default function NewPropertyPage() {
  const router = useRouter();
  const [owners, setOwners] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({
    title: "", type: "APARTMENT", dealType: "SALE", region: "", ownerId: "",
    salePriceToman: "", depositToman: "", monthlyRentToman: "",
    sizeSqm: "", landSizeSqm: "", builtYear: "", address: "",
    floor: "", totalFloors: "", unitsPerFloor: "", unitCount: "",
    beds: "", passageWidth: "", buildingFrontage: "", buildingFloors: "",
  });
  const [flags, setFlags] = useState<Flags>(emptyFlags);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setFlag = (k: keyof Flags, v: boolean) => setFlags((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/customers?showLost=true&limit=200").then((r) => r.json()).then((d) => {
      const list = Array.isArray(d) ? d : d?.customers ?? [];
      setOwners(list);
    });
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.region) {
      setError("منطقه را انتخاب کنید");
      return;
    }
    if (!form.ownerId) {
      setError("مالک را انتخاب کنید");
      return;
    }
    setLoading(true);

    try {
      const isApartment = form.type === "APARTMENT";
      const isVillaLike = form.type === "VILLA" || form.type === "KOLANGI" || form.type === "LAND";
      const isCommercialLike = form.type === "SHOP" || form.type === "OFFICE" || form.type === "COMMERCIAL";

      const body: Record<string, unknown> = {
        title: form.title,
        type: form.type,
        dealType: form.dealType,
        region: form.region,
        ownerId: form.ownerId,
        address: form.address || null,
        beds: form.beds ? parseInt(form.beds, 10) : null,
        hasParking: flags.hasParking,
        hasStorage: flags.hasStorage,
        hasElevator: flags.hasElevator,
        hasTerrace: flags.hasTerrace,
        hasRenovated: flags.hasRenovated,
        isNewBuild: flags.isNewBuild,
      };

      if (form.dealType === "SALE") body.salePriceToman = form.salePriceToman || null;
      else {
        body.depositToman = form.depositToman || null;
        body.monthlyRentToman = form.monthlyRentToman || null;
      }

      if (form.sizeSqm) body.sizeSqm = parseFloat(form.sizeSqm);
      if (form.builtYear) body.builtYear = parseInt(form.builtYear, 10);

      if (isApartment) {
        if (form.floor) body.floor = parseInt(form.floor, 10);
        if (form.totalFloors) body.totalFloors = parseInt(form.totalFloors, 10);
        if (form.unitsPerFloor) body.unitsPerFloor = parseInt(form.unitsPerFloor, 10);
        if (form.unitCount) body.unitCount = parseInt(form.unitCount, 10);
      }
      if (isVillaLike) {
        if (form.landSizeSqm) body.landSizeSqm = parseFloat(form.landSizeSqm);
        if (form.passageWidth) body.passageWidth = parseFloat(form.passageWidth);
        if (form.buildingFrontage) body.buildingFrontage = parseFloat(form.buildingFrontage);
        if (form.buildingFloors) body.buildingFloors = parseInt(form.buildingFloors, 10);
      }
      if (isCommercialLike) {
        if (form.passageWidth) body.passageWidth = parseFloat(form.passageWidth);
      }

      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `خطا (${res.status})`);
        return;
      }
      router.push("/properties");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  const saleWords = form.salePriceToman ? formatTomanWithWords(form.salePriceToman).words : "";
  const depositWords = form.depositToman ? formatTomanWithWords(form.depositToman).words : "";
  const rentWords = form.monthlyRentToman ? formatTomanWithWords(form.monthlyRentToman).words : "";

  const t = form.type;
  const isApartment = t === "APARTMENT";
  const isVillaLike = t === "VILLA" || t === "KOLANGI" || t === "LAND";
  const isCommercialLike = t === "SHOP" || t === "OFFICE" || t === "COMMERCIAL";

  const sizeLabel = isVillaLike
    ? t === "LAND"
      ? "متراژ زمین / ملک (متر)"
      : "متراژ مسکونی — زیربنا (متر)"
    : "متراژ کل (متر)";

  return (
    <div>
      <Header title="فایل جدید" subtitle="کد فایل به‌صورت خودکار صادر می‌شود" />
      <form onSubmit={submit} className="p-6 max-w-2xl space-y-4">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4">
          <h3 className="text-[13px] font-bold mb-3">مشخصات اصلی</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>عنوان *</Label>
              <Input value={form.title} onChange={(e) => upd("title", e.target.value)} required placeholder="مثلا آپارتمان 2خوابه بهمنی" className="mt-1" />
            </div>
            <div>
              <Label>نوع ملک</Label>
              <Select value={form.type} onChange={(e) => upd("type", e.target.value)} className="mt-1">
                {propertyTypes.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>نوع معامله</Label>
              <Select value={form.dealType} onChange={(e) => upd("dealType", e.target.value)} className="mt-1">
                <option value="SALE">فروش</option>
                <option value="RENT">رهن و اجاره</option>
              </Select>
            </div>
            <div>
              <Label>منطقه *</Label>
              <Select value={form.region} onChange={(e) => upd("region", e.target.value)} className="mt-1" required>
                <option value="">انتخاب کنید</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <div>
              <SearchSelect
                label="مالک"
                required
                value={form.ownerId}
                onChange={(id) => upd("ownerId", id)}
                options={owners.map((o) => ({ id: o.id, label: o.name, sub: o.phone }))}
                placeholder="جستجوی مالک (نام یا شماره)..."
                emptyText="مشتری/مالکی با این عبارت نیست"
              />
            </div>
            <div>
              <Label>آدرس دقیق</Label>
              <Input value={form.address} onChange={(e) => upd("address", e.target.value)} placeholder="خیابان، کوچه، پلاک..." className="mt-1" />
            </div>
            {form.dealType === "SALE" ? (
              <div>
                <Label>قیمت فروش (تومان)</Label>
                <NumberInput value={form.salePriceToman} onChange={(e) => upd("salePriceToman", e.target.value)} placeholder="3500000000" className="mt-1" />
                {saleWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{saleWords}</p>}
              </div>
            ) : (
              <>
                <div>
                  <Label>رهن / ودیعه (تومان)</Label>
                  <NumberInput value={form.depositToman} onChange={(e) => upd("depositToman", e.target.value)} className="mt-1" />
                  {depositWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{depositWords}</p>}
                </div>
                <div>
                  <Label>اجاره ماهانه (تومان)</Label>
                  <NumberInput value={form.monthlyRentToman} onChange={(e) => upd("monthlyRentToman", e.target.value)} className="mt-1" />
                  {rentWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{rentWords}</p>}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4">
          <h3 className="text-[13px] font-bold mb-3">
            مشخصات ملک
            {isApartment ? " — آپارتمان" : isVillaLike ? " — ویلایی / کلنگی / زمین" : isCommercialLike ? " — مغازه / اداری / تجاری" : ""}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Num label={sizeLabel} value={form.sizeSqm} onChange={(v) => upd("sizeSqm", v)} placeholder="85.5" />
            {(isApartment || isCommercialLike) && (
              <Num label="سال ساخت (شمسی)" value={form.builtYear} onChange={(v) => upd("builtYear", v)} placeholder="1398" />
            )}

            {isApartment && (
              <>
                <Num label="طبقه" value={form.floor} onChange={(v) => upd("floor", v)} placeholder="2" />
                <Num label="تعداد طبقات ساختمان" value={form.totalFloors} onChange={(v) => upd("totalFloors", v)} placeholder="4" />
                <Num label="تعداد واحد در هر طبقه" value={form.unitsPerFloor} onChange={(v) => upd("unitsPerFloor", v)} placeholder="2" />
                <Num label="تعداد کل واحد" value={form.unitCount} onChange={(v) => upd("unitCount", v)} placeholder="8" />
                <Num label="تعداد خواب" value={form.beds} onChange={(v) => upd("beds", v)} placeholder="2" />
              </>
            )}

            {isVillaLike && (
              <>
                <Num label="متراژ زمین (متر)" value={form.landSizeSqm} onChange={(v) => upd("landSizeSqm", v)} placeholder="250" />
                <Num label="عرض گذر (متر)" value={form.passageWidth} onChange={(v) => upd("passageWidth", v)} placeholder="12" />
                <Num label="برِ ملک (متر)" value={form.buildingFrontage} onChange={(v) => upd("buildingFrontage", v)} placeholder="10" />
                <Num label="تعداد طبقات بنا" value={form.buildingFloors} onChange={(v) => upd("buildingFloors", v)} placeholder="2" />
                {t !== "LAND" && <Num label="تعداد خواب" value={form.beds} onChange={(v) => upd("beds", v)} placeholder="3" />}
              </>
            )}

            {isCommercialLike && (
              <>
                <Num label="تعداد اتاق" value={form.beds} onChange={(v) => upd("beds", v)} placeholder="—" />
                <Num label="عرض گذر (متر)" value={form.passageWidth} onChange={(v) => upd("passageWidth", v)} placeholder="10" />
              </>
            )}

            {isApartment && (
              <CheckRow
                flags={flags}
                onChange={setFlag}
                keys={["hasParking", "hasStorage", "hasElevator", "hasTerrace", "hasRenovated", "isNewBuild"]}
              />
            )}
            {isVillaLike && (
              <CheckRow
                flags={flags}
                onChange={setFlag}
                keys={["hasParking", "hasStorage", "hasRenovated", "isNewBuild"]}
              />
            )}
            {isCommercialLike && (
              <CheckRow
                flags={flags}
                onChange={setFlag}
                keys={["hasParking", "hasStorage", "hasRenovated"]}
              />
            )}
          </div>
        </div>

        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت فایل"}</Button>
      </form>
    </div>
  );
}
