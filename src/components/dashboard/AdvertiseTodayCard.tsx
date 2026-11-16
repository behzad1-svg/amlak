"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { SearchSelect, type SearchOption } from "@/components/ui/SearchSelect";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";
import { useRole } from "@/hooks/useRole";

/** کارت داشبورد «امروز کدوم فایل رو آگهی می‌کنی؟» — فایل را انتخاب کن، «آگهی کردم» را بزن؛
 *  فعالیت ADVERTISED ثبت می‌شود، اعلان برای مدیر می‌رود و در گزارش عملکرد شمرده می‌شود.
 *  جستجوی فایل سمت سرور است (عنوان/کد + نوع معامله + مشاور) — همان الگوی فرم کارت جلسه. */
export function AdvertiseTodayCard() {
  const { isOwner } = useRole();
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [propertyTotal, setPropertyTotal] = useState<number | null>(null);
  const [propSearch, setPropSearch] = useState("");
  const [propDealType, setPropDealType] = useState("");
  const [propAdvisorId, setPropAdvisorId] = useState("");
  const [fileAdvisorOptions, setFileAdvisorOptions] = useState<SearchOption[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const propertyIdRef = useRef("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  // جستجوی فایل — سمت سرور (عنوان/کد + نوع معامله + مشاور)، تا سقف ۱۰۰ تایی لیست، گزینه‌های ناسازگار را پنهان نکند
  const loadPropertyOptions = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (propSearch.trim()) params.set("search", propSearch.trim());
    if (propDealType) params.set("dealType", propDealType);
    if (propAdvisorId && isOwner) params.set("listedById", propAdvisorId);
    try {
      const d = await apiJson<{ properties?: { id: string; title: string; code?: string | null }[]; total?: number } | { id: string; title: string; code?: string | null }[]>(`/api/properties?${params.toString()}`);
      const list = (Array.isArray(d) ? d : d.properties ?? []) as { id: string; title: string; code?: string | null }[];
      setPropertyTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
      const opts = list.map((x) => ({ id: x.id, label: x.code ? `${x.code} — ${x.title}` : x.title }));
      // فایل انتخاب‌شده را نگه دار — حتی اگر با فیلتر تازه در لیست نباشد، برچسبش ناپدید نشود
      setOptions((prev) => {
        const selId = propertyIdRef.current;
        if (!selId) return opts;
        const sel = prev.find((o) => o.id === selId);
        if (sel && !opts.some((o) => o.id === sel.id)) return [...opts, sel];
        return opts;
      });
    } catch {
      // خطای بارگذاری لیست فایل بی‌صدا رد می‌شود — مثل قبل
    }
  }, [propSearch, propDealType, propAdvisorId, isOwner]);

  useEffect(() => {
    propertyIdRef.current = propertyId;
  }, [propertyId]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadPropertyOptions();
    }, propSearch.trim() ? 280 : 0);
    return () => clearTimeout(t);
  }, [propSearch, propDealType, propAdvisorId, loadPropertyOptions]);

  useEffect(() => {
    apiJson<unknown>("/api/users")
      .then((u) => {
        const users = (Array.isArray(u) ? u : []) as { id: string; name: string }[];
        setFileAdvisorOptions(users.map((x) => ({ id: x.id, label: x.name })));
      })
      .catch(() => undefined);
  }, []);

  async function submit() {
    if (!propertyId || busy) return;
    setBusy(true);
    setMsg("");
    setOk("");
    try {
      await apiFetch(`/api/properties/${propertyId}/advertise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setOk("ثبت شد — آگهی امروز در آمار شما و اعلان مدیر ثبت شد.");
      setPropertyId("");
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-0">
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-violet-600 text-white">
            <Megaphone className="h-4 w-4" />
          </span>
          امروز کدوم فایل رو آگهی می‌کنی؟
        </CardTitle>
        <Link href="/reports" className="text-[12px] font-medium text-[var(--sea)] hover:underline">
          دیدن آمار آگهی‌ها
        </Link>
      </CardHeader>
      <div className="px-4 pb-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select value={propDealType} onChange={(e) => setPropDealType(e.target.value)} aria-label="نوع معامله">
            <option value="">همه معاملات</option>
            <option value="SALE">فروش</option>
            <option value="RENT">رهن و اجاره</option>
          </Select>
          {isOwner && (
            <Select value={propAdvisorId} onChange={(e) => setPropAdvisorId(e.target.value)} aria-label="مشاور">
              <option value="">همه مشاورها</option>
              {fileAdvisorOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </Select>
          )}
        </div>
        <SearchSelect
          label="فایل"
          value={propertyId}
          onChange={setPropertyId}
          options={options}
          placeholder="فایل را جستجو و انتخاب کنید..."
          onSearchChange={setPropSearch}
        />
        {propertyTotal !== null && propertyTotal > options.length && (
          <p className="text-[11px] text-[var(--ink-3)]">
            نمایش {toFaDigits(String(options.length))} از {toFaDigits(String(propertyTotal))} فایل — فیلترها را دقیق‌تر کنید.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={submit} disabled={busy || !propertyId}>
            {busy ? "در حال ثبت..." : "آگهی کردم"}
          </Button>
          {ok && <span className="text-[12px] text-emerald-700">{ok}</span>}
          {msg && <span className="text-[12px] text-red-600">{msg}</span>}
        </div>
        <p className="text-[12px] text-[var(--ink-3)]">
          هر فایل در هر روز یک بار شمرده می‌شود؛ آگهی‌های امروز هر مشاور در «وضعیت تیم» و گزارش عملکرد دیده می‌شود.
        </p>
      </div>
    </Card>
  );
}
