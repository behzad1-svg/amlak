"use client";
import { useEffect, useState } from "react";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";

/** دکمه «آگهی کردم» روی فایل — مثل تیک کارشناسی، ولی هر روز یک فعالیت تازه ثبت می‌کند.
 *  اگر امروز برای همین فایل آگهی ثبت شده باشد، دکمه همان حالت «ثبت شده» را نشان می‌دهد. */
export function AdvertiseButton({
  propertyId,
  onChanged,
}: {
  propertyId: string;
  onChanged?: () => void;
}) {
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    apiJson<{ advertisedToday?: boolean }>(`/api/properties/${propertyId}/advertise`)
      .then((d) => setDone(!!d.advertisedToday))
      .catch(() => undefined);
  }, [propertyId]);

  async function mark() {
    if (busy || done) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch(`/api/properties/${propertyId}/advertise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setDone(true);
      setMsg("ثبت شد — در آمار شما و اعلان مدیر ثبت شد.");
      onChanged?.();
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={done ? "outline" : "primary"} onClick={mark} disabled={busy || done}>
        {done ? "آگهی امروز ثبت شده ✓" : busy ? "در حال ثبت..." : "آگهی کردم"}
      </Button>
      {msg && <span className="text-[12px] text-[var(--ink-3)]">{msg}</span>}
    </div>
  );
}
