"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Label, Select, Textarea } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { LOST_REASON_LABELS, PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatTomanCompact, toFaDigits } from "@/lib/utils";
import { apiJson } from "@/lib/api";
import { useRole } from "@/hooks/useRole";
import { Modal } from "@/components/ui/Modal";

type PropertyOption = {
  id: string;
  code?: string | null;
  title: string;
  type: string;
  dealType: string;
  region: string;
  status: string;
  salePriceToman?: string | null;
  depositToman?: string | null;
};

export type OutcomeKind = "WON" | "FAILED";

export function StageOutcomeModal({
  kind,
  preferredDealType,
  preferredType,
  onClose,
  onSubmit,
}: {
  kind: OutcomeKind;
  preferredDealType?: string | null;
  preferredType?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    stage: OutcomeKind;
    notes?: string | null;
    lostReasonCategory?: string;
    lostReasonDetail?: string | null;
    propertyId?: string | null;
  }) => Promise<void>;
}) {
  const isWon = kind === "WON";
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertiesTotal, setPropertiesTotal] = useState<number | null>(null);
  const [propertiesError, setPropertiesError] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [dealTypeFilter, setDealTypeFilter] = useState(preferredDealType ?? "");
  const [titleSearch, setTitleSearch] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [rentMin, setRentMin] = useState("");
  const [rentMax, setRentMax] = useState("");
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const propertyIdRef = useRef("");
  const { isOwner } = useRole();

  const [notes, setNotes] = useState("");
  const [reasonCat, setReasonCat] = useState("OTHER");
  const [reasonDetail, setReasonDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    propertyIdRef.current = propertyId;
  }, [propertyId]);

  useEffect(() => {
    if (!isWon) return;
    apiJson<{ id: string; name: string }[]>("/api/users")
      .then((d) => {
        if (Array.isArray(d)) setAgents(d.map((u) => ({ id: u.id, name: u.name })));
      })
      .catch(() => {});
  }, [isWon]);

  // جستجوی فایل — سمت سرور (عنوان/کد + نوع معامله + مشاور)، تا سقف ۱۰۰ تایی لیست، گزینه‌های ناسازگار را پنهان نکند
  useEffect(() => {
    if (!isWon) return;
    const params = new URLSearchParams({ status: "ACTIVE", limit: "100" });
    if (dealTypeFilter) params.set("dealType", dealTypeFilter);
    if (agentFilter && isOwner) params.set("listedById", agentFilter);
    if (titleSearch.trim()) params.set("search", titleSearch.trim());
    if (priceMin) params.set("priceMin", priceMin);
    if (priceMax) params.set("priceMax", priceMax);
    if (rentMin) params.set("rentMin", rentMin);
    if (rentMax) params.set("rentMax", rentMax);
    if (preferredType) params.set("type", preferredType);
    const t = setTimeout(() => {
      apiJson<{ properties?: PropertyOption[]; total?: number } | PropertyOption[]>(`/api/properties?${params.toString()}`)
        .then((d) => {
          const list = (Array.isArray(d) ? d : d?.properties ?? []) as PropertyOption[];
          // فایل انتخاب‌شده را نگه دار — حتی اگر با فیلتر تازه در لیست نباشد
          setProperties((prev) => {
            const selId = propertyIdRef.current;
            if (!selId) return list;
            const sel = prev.find((p) => p.id === selId);
            if (sel && !list.some((p) => p.id === sel.id)) return [...list, sel];
            return list;
          });
          setPropertiesTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
          setPropertiesError("");
        })
        .catch(() => {
          setProperties([]);
          setPropertiesTotal(null);
          setPropertiesError("لیست فایل‌ها بارگذاری نشد — مودال را ببندید و دوباره باز کنید.");
        });
    }, titleSearch.trim() || priceMin || priceMax || rentMin || rentMax ? 280 : 0);
    return () => clearTimeout(t);
  }, [isWon, dealTypeFilter, agentFilter, titleSearch, priceMin, priceMax, rentMin, rentMax, preferredType, isOwner]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!isWon && !reasonDetail.trim()) {
      setErr("دلیل ناموفقی را بنویسید");
      return;
    }
    if (isWon && !propertyId) {
      setErr("فایلی که مشتری گرفته را انتخاب کنید تا بایگانی شود");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        stage: kind,
        notes: isWon ? notes.trim() || null : null,
        lostReasonCategory: isWon ? undefined : reasonCat,
        lostReasonDetail: isWon ? null : reasonDetail.trim() || null,
        propertyId: isWon ? propertyId : null,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "خطا در ثبت");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <Modal onClose={onClose} ariaLabel={isWon ? "ثبت موفقیت مشتری" : "ثبت ناموفقی مشتری"}>
        <h3 className={`text-[15px] font-extrabold ${isWon ? "text-emerald-700" : "text-red-700"}`}>
          {isWon ? "ثبت موفقیت مشتری" : "ثبت ناموفقی مشتری"}
        </h3>
        <p className="mt-1 text-[12px] text-[var(--ink-3)]">
          {isWon
            ? "فایلی که معامله شده را تگ کنید — از لیست فعال‌ها بایگانی می‌شود و برای بقیه نمی‌آید."
            : "دلیل ناموفقی را ثبت کنید تا در تاریخچه بماند."}
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {isWon ? (
            <>
              <div>
                <div className="mb-2 grid gap-2 sm:grid-cols-2">
                  <Select value={dealTypeFilter} onChange={(e) => setDealTypeFilter(e.target.value)} aria-label="نوع معامله">
                    <option value="">همه معاملات</option>
                    <option value="SALE">فروش</option>
                    <option value="RENT">رهن و اجاره</option>
                  </Select>
                  {isOwner && (
                    <Select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} aria-label="مشاور">
                      <option value="">همه مشاورها</option>
                      {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </Select>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-1.5">
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder={dealTypeFilter === "RENT" ? "ودیعه از" : dealTypeFilter === "SALE" ? "قیمت از" : "قیمت/ودیعه از"}
                      value={priceMin}
                      onChange={(e) => setPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                    <span className="text-[var(--ink-3)]">تا</span>
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder={dealTypeFilter === "RENT" ? "ودیعه تا" : dealTypeFilter === "SALE" ? "قیمت تا" : "قیمت/ودیعه تا"}
                      value={priceMax}
                      onChange={(e) => setPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                  {dealTypeFilter === "RENT" && (
                    <div className="flex items-center gap-1.5">
                      <Input
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="اجاره ماهانه از"
                        value={rentMin}
                        onChange={(e) => setRentMin(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                      <span className="text-[var(--ink-3)]">تا</span>
                      <Input
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="اجاره ماهانه تا"
                        value={rentMax}
                        onChange={(e) => setRentMax(e.target.value.replace(/[^0-9]/g, ""))}
                      />
                    </div>
                  )}
                </div>
                <SearchSelect
                  label="فایل معامله‌شده"
                  required
                  value={propertyId}
                  onChange={setPropertyId}
                  options={properties.map((p) => ({
                    id: p.id,
                    label: `${p.code ? `${p.code} — ` : ""}${p.title}`,
                    sub: [
                      PROPERTY_TYPE_LABELS[p.type] ?? p.type,
                      DEAL_TYPE_LABELS[p.dealType] ?? p.dealType,
                      p.region,
                      p.dealType === "SALE" && p.salePriceToman
                        ? formatTomanCompact(p.salePriceToman)
                        : p.dealType === "RENT" && p.depositToman
                          ? `ودیعه ${formatTomanCompact(p.depositToman)}`
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  placeholder="جستجوی فایل (کد یا عنوان)..."
                  onSearchChange={setTitleSearch}
                  emptyText="فایل فعالی یافت نشد"
                />
                {propertiesError && (
                  <p className="mt-1 text-[11px] text-red-600" role="alert">{propertiesError}</p>
                )}
                {properties.length === 0 && !propertiesError && (
                  <p className="mt-1 text-[11px] text-[var(--ink-3)]">فایل فعالی یافت نشد — اول فایل بسازید یا فیلتر نوع معامله را بردارید.</p>
                )}
                {propertiesTotal !== null && propertiesTotal > properties.length && (
                  <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                    نمایش {toFaDigits(String(properties.length))} از {toFaDigits(String(propertiesTotal))} فایل فعال — برای دیدن بقیه، فیلتر نوع معامله/نوع ملک را تغییر دهید یا در صفحهٔ فایل‌ها جستجو کنید.
                  </p>
                )}
                <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                  پس از ثبت: وضعیت فایل «فروخته‌شده / اجاره‌رفته» می‌شود و در تطبیق برای دیگران نمی‌آید.
                </p>
              </div>
              <div>
                <Label htmlFor="f-notes">یادداشت موفقیت (اختیاری)</Label>
                <Textarea id="f-notes"
                  className="mt-1"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="مثلا: از فایل بهمنی خرید کرد، قرارداد دیروز امضا شد..."
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>دلیل ناموفقی *</Label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {Object.entries(LOST_REASON_LABELS).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setReasonCat(k)}
                      className={`rounded-full border px-3 py-1.5 text-[12px] ${
                        reasonCat === k
                          ? "border-[var(--pomegranate)] bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] font-bold"
                          : "border-[var(--line)] bg-white text-[var(--ink-2)]"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="f-reasonDetail">توضیح *</Label>
                <Textarea id="f-reasonDetail"
                  className="mt-1"
                  rows={3}
                  value={reasonDetail}
                  onChange={(e) => setReasonDetail(e.target.value)}
                  placeholder="مثلا: بودجه کم بود، از منطقه منصرف شد..."
                  required
                />
              </div>
            </>
          )}

          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className={isWon ? "bg-emerald-700 hover:bg-emerald-800" : ""}>
              {saving ? "در حال ثبت..." : isWon ? "ثبت موفقیت + بایگانی فایل" : "ثبت ناموفقی"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>انصراف</Button>
          </div>
        </form>
    </Modal>
  );
}
