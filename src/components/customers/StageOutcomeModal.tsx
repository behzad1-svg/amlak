"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, Textarea, NumberInput } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { useRole } from "@/hooks/useRole";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { LOST_REASON_LABELS, PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatTomanCompact, toFaDigits } from "@/lib/utils";
import { apiJson } from "@/lib/api";

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
    commissionToman?: string | null;
    commissionPercent?: number | null;
    dealSalePriceToman?: string | null;
  }) => Promise<void>;
}) {
  const isWon = kind === "WON";
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertiesTotal, setPropertiesTotal] = useState<number | null>(null);
  const [propertiesError, setPropertiesError] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  // نقد ۱۰ — مودال دیالوگ واقعی است: Escape می‌بندد و Tab داخل مودال می‌ماند
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const els = panelRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(els).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus();
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  const [notes, setNotes] = useState("");
  const [reasonCat, setReasonCat] = useState("OTHER");
  const [reasonDetail, setReasonDetail] = useState("");
  const { isOwner } = useRole();
  const [commissionToman, setCommissionToman] = useState("");
  const [commissionPercent, setCommissionPercent] = useState("");
  const [salePriceToman, setSalePriceToman] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isWon) return;
    const params = new URLSearchParams({ status: "ACTIVE", limit: "100" });
    if (preferredDealType) params.set("dealType", preferredDealType);
    if (preferredType) params.set("type", preferredType);
    apiJson<{ properties?: PropertyOption[]; total?: number } | PropertyOption[]>(`/api/properties?${params.toString()}`)
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.properties ?? [];
        setProperties(list as PropertyOption[]);
        setPropertiesTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
      })
      .catch(() => {
        setProperties([]);
        setPropertiesTotal(null);
        setPropertiesError("لیست فایل‌ها بارگذاری نشد — مودال را ببندید و دوباره باز کنید.");
      });
  }, [isWon, preferredDealType, preferredType]);

  const selectedProperty = properties.find((p) => p.id === propertyId);
  const isSaleDeal = selectedProperty ? selectedProperty.dealType === "SALE" : preferredDealType !== "RENT";
  const isSaleRef = useRef(isSaleDeal);
  isSaleRef.current = isSaleDeal;

  // پیش‌فرض قیمت فروش از فایل انتخاب‌شده؛ با عوض شدن فایل، قیمت به قیمت فایل تازه برمی‌گردد
  // (ویرایش دستی مدیر فقط تا وقتی سر جایش می‌ماند که فایل عوض نشده باشد).
  const lastPricedPropertyId = useRef("");
  useEffect(() => {
    if (!isWon) return;
    const p = properties.find((pp) => pp.id === propertyId);
    if (!p) return;
    if (lastPricedPropertyId.current === p.id) return;
    lastPricedPropertyId.current = p.id;
    setSalePriceToman(p.dealType === "SALE" ? (p.salePriceToman ?? "") : "");
  }, [isWon, properties, propertyId]);

  // محاسبه خودکار مبلغ کمیسیون: درصد × قیمت فروش (فقط فروش؛ اجاره دستی است).
  // فقط وقتی درصد یا قیمت عوض شود حساب می‌شود، پس ویرایش دستی مبلغ سر جایش می‌ماند.
  useEffect(() => {
    if (!isWon || !isOwner || !isSaleRef.current) return;
    if (commissionPercent === "" || salePriceToman === "") return;
    const pct = Number(commissionPercent);
    const price = Number(salePriceToman);
    if (!Number.isFinite(pct) || !Number.isFinite(price) || pct < 0 || pct > 100 || price <= 0) return;
    setCommissionToman(String(Math.round((price * pct) / 100)));
  }, [isWon, isOwner, commissionPercent, salePriceToman]);

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
    if (isWon && isOwner && commissionPercent !== "") {
      const pct = Number(commissionPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setErr("درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
    }
    setSaving(true);
    try {
      await onSubmit({
        stage: kind,
        notes: isWon ? notes.trim() || null : null,
        lostReasonCategory: isWon ? undefined : reasonCat,
        lostReasonDetail: isWon ? null : reasonDetail.trim() || null,
        propertyId: isWon ? propertyId : null,
        commissionToman: isWon && isOwner && commissionToman !== "" ? commissionToman : null,
        commissionPercent: isWon && isOwner && commissionPercent !== "" ? Number(commissionPercent) : null,
        dealSalePriceToman: isWon && isOwner && isSaleDeal && salePriceToman !== "" ? salePriceToman : null,
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : "خطا در ثبت");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="بستن" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isWon ? "ثبت موفقیت مشتری" : "ثبت ناموفقی مشتری"}
        className="relative w-full max-w-lg rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-xl"
      >
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
              {isOwner && (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-3 space-y-3">
                  <p className="text-[12.5px] font-bold">کمیسیون معامله (فقط مدیر)</p>
                  {isSaleDeal && (
                    <MoneyInput
                      label="قیمت فروش معامله (تومان)"
                      value={salePriceToman}
                      onChange={setSalePriceToman}
                      placeholder="مثلا ۱۰۰۰۰۰۰۰۰۰۰"
                      hint="از قیمت فایل پر می‌شود؛ قابل تغییر است"
                    />
                  )}
                  <div>
                    <Label htmlFor="f-commissionPercent">درصد کمیسیون (۰ تا ۱۰۰)</Label>
                    <NumberInput
                      id="f-commissionPercent"
                      className="mt-1"
                      value={commissionPercent}
                      onChange={(e) => setCommissionPercent(e.target.value)}
                      placeholder="مثلا ۱"
                    />
                  </div>
                  <MoneyInput
                    label="مبلغ کمیسیون (تومان)"
                    value={commissionToman}
                    onChange={setCommissionToman}
                    placeholder="مثلا ۵۰۰۰۰۰۰۰"
                    hint="خالی بماند یعنی بدون کمیسیون"
                  />
                  <p className="text-[11px] text-[var(--ink-3)]">
                    {isSaleDeal
                      ? "مبلغ از روی درصد × قیمت فروش حساب می‌شود؛ می‌توانید دستی هم عوضش کنید."
                      : "برای اجاره مبلغ کمیسیون دستی وارد می‌شود."}
                  </p>
                </div>
              )}
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
      </div>
    </div>
  );
}
