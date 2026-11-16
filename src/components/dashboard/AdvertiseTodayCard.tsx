"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchSelect, type SearchOption } from "@/components/ui/SearchSelect";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";

/** کارت داشبورد «امروز کدوم فایل رو آگهی می‌کنی؟» — فایل را انتخاب کن، «آگهی کردم» را بزن؛
 *  فعالیت ADVERTISED ثبت می‌شود، اعلان برای مدیر می‌رود و در گزارش عملکرد شمرده می‌شود. */
export function AdvertiseTodayCard() {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    apiJson<unknown>("/api/properties?limit=100")
      .then((d) => {
        const list = (Array.isArray(d) ? d : (d as { properties?: unknown[] }).properties ?? []) as {
          id: string;
          title: string;
          code?: string | null;
        }[];
        setOptions(list.map((x) => ({ id: x.id, label: x.code ? `${x.code} — ${x.title}` : x.title })));
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
    <Card className="p-0 overflow-hidden">
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
        <SearchSelect
          label="فایل"
          value={propertyId}
          onChange={setPropertyId}
          options={options}
          placeholder="فایل را جستجو و انتخاب کنید..."
        />
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
