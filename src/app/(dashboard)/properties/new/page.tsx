"use client";
import { useState, useEffect, useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Input, NumberInput, Select, Label, Textarea } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatTomanWithWords } from "@/lib/money";
import { CUSTOMER_SOURCE_LABELS, CUSTOMER_SOURCE_OPTIONS } from "@/lib/constants";

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
  // نقد ۱۰ — برچسب با htmlFor به ورودی وصل است
  const fieldId = useId();
  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <NumberInput id={fieldId} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="mt-1" />
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
    salePriceToman: "", pricePerSqm: "", depositToman: "", monthlyRentToman: "",
    sizeSqm: "", landSizeSqm: "", builtYear: "", address: "", description: "",
    floor: "", totalFloors: "", unitsPerFloor: "", unitCount: "",
    beds: "", passageWidth: "", buildingFrontage: "", buildingFloors: "",
    isAppraised: "false", source: "",
  });
  const [flags, setFlags] = useState<Flags>(emptyFlags);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [accessUserIds, setAccessUserIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // ثبت مالک درون‌خطی — بدون رفتن به صفحه مشتریان
  const [showNewOwner, setShowNewOwner] = useState(false);
  const [newOwner, setNewOwner] = useState({ name: "", phone: "", source: "" });
  const [newOwnerMsg, setNewOwnerMsg] = useState("");
  const [newOwnerBusy, setNewOwnerBusy] = useState(false);
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setFlag = (k: keyof Flags, v: boolean) => setFlags((f) => ({ ...f, [k]: v }));
  const toggleAccess = (id: string) =>
    setAccessUserIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  // قیمت هر متر — محاسبه دوطرفه با قیمت کل، مثل محاسبه خودکار کمیسیون:
  // مقدار دستی هر فیلد تا وقتی فیلد دیگر عوض شود می‌ماند.
  const lastPriceField = useRef<"total" | "perMetre" | null>(null);
  // متراژ مبنا: زمین/ویلا/کلنگی → متراژ زمین، بقیه → متراژ
  const baseSizeNum = (() => {
    const villaLike = form.type === "VILLA" || form.type === "KOLANGI" || form.type === "LAND";
    const raw = villaLike ? form.landSizeSqm : form.sizeSqm;
    const n = parseFloat(raw || "");
    return Number.isFinite(n) && n > 0 ? n : 0;
  })();
  function onSalePrice(v: string) {
    upd("salePriceToman", v);
    lastPriceField.current = "total";
    if (v !== "" && baseSizeNum > 0) {
      const n = Math.round(Number(v) / baseSizeNum);
      if (Number.isFinite(n) && n > 0) upd("pricePerSqm", String(n));
    }
  }
  function onPerMetre(v: string) {
    upd("pricePerSqm", v);
    lastPriceField.current = "perMetre";
    if (v !== "" && baseSizeNum > 0) {
      const n = Math.round(Number(v) * baseSizeNum);
      if (Number.isFinite(n) && n > 0) upd("salePriceToman", String(n));
    }
  }
  // با عوض شدن متراژ مبنا (تغییر متراژ یا نوع ملک)، قیمتِ آخرین‌بار دستی‌واردشده
  // ثابت می‌ماند و دیگری دوباره محاسبه می‌شود
  useEffect(() => {
    if (baseSizeNum <= 0) return;
    if (lastPriceField.current === "perMetre") {
      if (form.pricePerSqm !== "") {
        const n = Math.round(Number(form.pricePerSqm) * baseSizeNum);
        if (Number.isFinite(n) && n > 0 && String(n) !== form.salePriceToman) upd("salePriceToman", String(n));
      }
    } else if (form.salePriceToman !== "") {
      const n = Math.round(Number(form.salePriceToman) / baseSizeNum);
      if (Number.isFinite(n) && n > 0 && String(n) !== form.pricePerSqm) upd("pricePerSqm", String(n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseSizeNum]);

  useEffect(() => {
    apiJson<{ customers?: { id: string; name: string; phone?: string }[] } | { id: string; name: string; phone?: string }[]>("/api/customers?showLost=true&limit=200&category=owners")
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.customers ?? [];
        setOwners(list);
      })
      .catch(() => {});
    apiJson<{ regions?: string[]; propertyTypes?: { value: string; label: string }[] }>("/api/settings")
      .then((d) => {
        if (d.regions) setRegions(d.regions);
        if (d.propertyTypes) setPropertyTypes(d.propertyTypes);
      })
      .catch(() => {});
    // مشاورهای دیگر برای لیست دسترسی کامل (خود ثبت‌کننده همیشه کامل می‌بیند)
    apiJson<{ user?: { id: string } }>("/api/auth/me")
      .then((me) => {
        const meId = me?.user?.id;
        return apiJson<{ id: string; name: string; role: string; active?: boolean }[]>("/api/users").then((us) => {
          const list = (Array.isArray(us) ? us : []).filter(
            (u) => u.role === "AGENT" && u.id !== meId && u.active !== false
          );
          setAgents(list.map((u) => ({ id: u.id, name: u.name })));
        });
      })
      .catch(() => {});
  }, []);

  // ثبت مالک تازه همین‌جا؛ اگر شماره تکراری باشد، همان مالک قبلی انتخاب می‌شود
  async function createOwner() {
    setNewOwnerMsg("");
    const name = newOwner.name.trim();
    const phone = newOwner.phone.trim();
    if (!name) { setNewOwnerMsg("نام مالک را وارد کنید"); return; }
    if (!/^[0-9]{10,15}$/.test(phone)) { setNewOwnerMsg("شماره باید ۱۰ تا ۱۵ رقم باشد"); return; }
    if (!newOwner.source) { setNewOwnerMsg("شیوه آشنایی را انتخاب کنید"); return; }
    setNewOwnerBusy(true);
    const pickExisting = async (): Promise<boolean> => {
      try {
        const found = await apiJson<{ customers?: { id: string; name: string; phone: string }[] } | { id: string; name: string; phone: string }[]>(
          `/api/customers?search=${encodeURIComponent(phone)}&showLost=true&limit=100&category=owners`
        );
        const list = Array.isArray(found) ? found : (found.customers ?? []);
        const hit = list.find((x) => x.phone === phone);
        if (!hit) return false;
        if (!owners.some((o) => o.id === hit.id)) setOwners((os) => [...os, { id: hit.id, name: hit.name, phone: hit.phone }]);
        upd("ownerId", hit.id);
        setNewOwnerMsg(`این شماره قبلاً برای «${hit.name}» ثبت شده است؛ همان مالک انتخاب شد.`);
        setShowNewOwner(false);
        return true;
      } catch {
        return false;
      }
    };
    try {
      if (await pickExisting()) return;
      const created = await apiJson<{ id: string; name: string; phone?: string }>("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, type: "OWNER", stage: "INITIAL_CONTACT", source: newOwner.source }),
      });
      setOwners((os) => [...os, { id: created.id, name: created.name, phone: created.phone }]);
      upd("ownerId", created.id);
      setNewOwner({ name: "", phone: "", source: "" });
      setShowNewOwner(false);
      setNewOwnerMsg("مالک جدید ثبت و انتخاب شد.");
    } catch (e) {
      // اگر هم‌زمان با همین شماره ثبت شده باشد، همان مالک قبلی را انتخاب کن
      if (e instanceof Error && e.message.includes("قبلا ثبت شده")) {
        if (await pickExisting()) return;
      }
      setNewOwnerMsg(errorMessage(e));
    } finally {
      setNewOwnerBusy(false);
    }
  }

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
        description: form.description.trim() || null,
        beds: form.beds ? parseInt(form.beds, 10) : null,
        hasParking: flags.hasParking,
        hasStorage: flags.hasStorage,
        hasElevator: flags.hasElevator,
        hasTerrace: flags.hasTerrace,
        hasRenovated: flags.hasRenovated,
        isNewBuild: flags.isNewBuild,
        isAppraised: form.isAppraised === "true",
        source: form.source || null,
        accessUserIds,
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

      await apiFetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.push("/properties");
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ارتباط با سرور");
    } finally {
      setLoading(false);
    }
  }

  const saleWords = form.salePriceToman ? formatTomanWithWords(form.salePriceToman).words : "";
  const perMetreWords = form.pricePerSqm ? formatTomanWithWords(form.pricePerSqm).words : "";
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
              <Label htmlFor="f-title">عنوان *</Label>
              <Input id="f-title" value={form.title} onChange={(e) => upd("title", e.target.value)} required placeholder="مثلا آپارتمان 2خوابه بهمنی" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="f-type">نوع ملک</Label>
              <Select id="f-type" value={form.type} onChange={(e) => upd("type", e.target.value)} className="mt-1">
                {propertyTypes.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="f-dealType">نوع معامله</Label>
              <Select id="f-dealType" value={form.dealType} onChange={(e) => upd("dealType", e.target.value)} className="mt-1">
                <option value="SALE">فروش</option>
                <option value="RENT">رهن و اجاره</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="f-region">منطقه *</Label>
              <Select id="f-region" value={form.region} onChange={(e) => upd("region", e.target.value)} className="mt-1" required>
                <option value="">انتخاب کنید</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="f-source">منبع فایل</Label>
              <Select id="f-source" value={form.source} onChange={(e) => upd("source", e.target.value)} className="mt-1">
                <option value="">—</option>
                {CUSTOMER_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s] ?? s}</option>)}
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
              {!showNewOwner ? (
                <button type="button" onClick={() => { setShowNewOwner(true); setNewOwnerMsg(""); }} className="mt-1.5 text-[13px] font-medium text-[var(--pomegranate)] hover:underline">
                  + ثبت مالک جدید
                </button>
              ) : (
                <div className="mt-2 space-y-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={newOwner.name} onChange={(e) => setNewOwner({ ...newOwner, name: e.target.value })} placeholder="نام و نام خانوادگی مالک" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createOwner(); } }} />
                    <Input value={newOwner.phone} onChange={(e) => setNewOwner({ ...newOwner, phone: e.target.value.replace(/[^0-9]/g, "") })} placeholder="شماره تماس (مثلا 09170000004)" dir="ltr" className="text-left" inputMode="numeric" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void createOwner(); } }} />
                  </div>
                  <Select value={newOwner.source} onChange={(e) => setNewOwner({ ...newOwner, source: e.target.value })} aria-label="شیوه آشنایی مالک">
                    <option value="">شیوه آشنایی...</option>
                    {CUSTOMER_SOURCE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s] ?? s}</option>
                    ))}
                  </Select>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={() => void createOwner()} disabled={newOwnerBusy}>{newOwnerBusy ? "..." : "ثبت مالک"}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setShowNewOwner(false)}>انصراف</Button>
                  </div>
                </div>
              )}
              {newOwnerMsg && <p className="mt-1.5 text-[12.5px] text-[var(--ink-2)]">{newOwnerMsg}</p>}
            </div>
            <div>
              <Label htmlFor="f-address">آدرس دقیق</Label>
              <Input id="f-address" value={form.address} onChange={(e) => upd("address", e.target.value)} placeholder="خیابان، کوچه، پلاک..." className="mt-1" />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="f-description">توضیحات فایل</Label>
              <Textarea id="f-description" value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="نکات فایل: مالک عجله دارد، قیمت قابل مذاکره است..." rows={3} className="mt-1" />
            </div>
            {form.dealType === "SALE" ? (
              <>
                <div>
                  <Label htmlFor="f-salePriceToman">قیمت فروش (تومان)</Label>
                  <NumberInput id="f-salePriceToman" value={form.salePriceToman} onChange={(e) => onSalePrice(e.target.value)} placeholder="3500000000" className="mt-1" />
                  {saleWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{saleWords}</p>}
                </div>
                <div>
                  <Label htmlFor="f-pricePerSqm">قیمت هر متر (تومان)</Label>
                  <NumberInput id="f-pricePerSqm" value={form.pricePerSqm} onChange={(e) => onPerMetre(e.target.value)} placeholder="35000000" className="mt-1" disabled={baseSizeNum <= 0} />
                  {perMetreWords ? (
                    <p className="mt-1 text-xs text-[var(--ink-3)]">{perMetreWords}</p>
                  ) : baseSizeNum <= 0 ? (
                    <p className="mt-1 text-xs text-[var(--ink-3)]">اول متراژ را وارد کنید</p>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="f-depositToman">رهن / ودیعه (تومان)</Label>
                  <NumberInput id="f-depositToman" value={form.depositToman} onChange={(e) => upd("depositToman", e.target.value)} className="mt-1" />
                  {depositWords && <p className="mt-1 text-xs text-[var(--ink-3)]">{depositWords}</p>}
                </div>
                <div>
                  <Label htmlFor="f-monthlyRentToman">اجاره ماهانه (تومان)</Label>
                  <NumberInput id="f-monthlyRentToman" value={form.monthlyRentToman} onChange={(e) => upd("monthlyRentToman", e.target.value)} className="mt-1" />
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
            <div className="md:col-span-2 flex items-center gap-2 pt-1 border-t border-[var(--line)] mt-1">
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isAppraised === "true"}
                  onChange={(e) => upd("isAppraised", e.target.checked ? "true" : "false")}
                />
                فایل از قبل کارشناسی شده (مشاور حضوری دیده)
              </label>
            </div>
          </div>
        </div>

        <div className="rounded-[14px] border border-[var(--line)] bg-white p-4">
          <h3 className="text-[13px] font-bold mb-1">دسترسی کامل مشاورهای دیگر</h3>
          <p className="text-[12px] text-[var(--ink-3)] mb-3">
            مشاورهای تیک‌خورده آدرس دقیق، نام و شماره مالک را می‌بینند. بقیه فقط اطلاعات جزئی فایل را می‌بینند.
          </p>
          {agents.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-3)]">مشاور دیگری در سیستم نیست.</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {agents.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={accessUserIds.includes(a.id)} onChange={() => toggleAccess(a.id)} />
                  {a.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <Button type="submit" disabled={loading}>{loading ? "در حال ثبت..." : "ثبت فایل"}</Button>
      </form>
    </div>
  );
}
