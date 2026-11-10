"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { LOST_REASON_LABELS, PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatToman } from "@/lib/utils";

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
  const [propertyId, setPropertyId] = useState("");
  const [notes, setNotes] = useState("");
  const [reasonCat, setReasonCat] = useState("OTHER");
  const [reasonDetail, setReasonDetail] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!isWon) return;
    const params = new URLSearchParams({ status: "ACTIVE", limit: "100" });
    if (preferredDealType) params.set("dealType", preferredDealType);
    if (preferredType) params.set("type", preferredType);
    fetch(`/api/properties?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : d?.properties ?? [];
        setProperties(list as PropertyOption[]);
      })
      .catch(() => setProperties([]));
  }, [isWon, preferredDealType, preferredType]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="بستن" />
      <div className="relative w-full max-w-lg rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-xl">
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
                        ? formatToman(p.salePriceToman)
                        : p.dealType === "RENT" && p.depositToman
                          ? `ودیعه ${formatToman(p.depositToman)}`
                          : "",
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  }))}
                  placeholder="جستجوی فایل (کد یا عنوان)..."
                  emptyText="فایل فعالی یافت نشد"
                />
                {properties.length === 0 && (
                  <p className="mt-1 text-[11px] text-[var(--ink-3)]">فایل فعالی یافت نشد — اول فایل بسازید یا فیلتر نوع معامله را بردارید.</p>
                )}
                <p className="mt-1 text-[11px] text-[var(--ink-3)]">
                  پس از ثبت: وضعیت فایل «فروخته‌شده / اجاره‌رفته» می‌شود و در تطبیق برای دیگران نمی‌آید.
                </p>
              </div>
              <div>
                <Label>یادداشت موفقیت (اختیاری)</Label>
                <Textarea
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
                <Label>توضیح *</Label>
                <Textarea
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
