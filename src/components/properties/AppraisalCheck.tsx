"use client";
import { useState } from "react";
import { formatDate } from "@/lib/utils";

/** فقط تیک «کارشناسی» — بدون توضیح اضافه */
export function AppraisalCheck({
  propertyId,
  isAppraised,
  appraisedByName,
  appraisedAt,
  isOwner,
  onChanged,
}: {
  propertyId: string;
  isAppraised: boolean;
  appraisedByName?: string | null;
  appraisedAt?: string | null;
  isOwner: boolean;
  onChanged?: () => void;
}) {
  const [on, setOn] = useState(!!isAppraised);
  const [busy, setBusy] = useState(false);
  const [who, setWho] = useState<{ name: string; at: string | null } | null>(
    isAppraised && appraisedByName
      ? { name: appraisedByName, at: appraisedAt ?? null }
      : null
  );
  const [error, setError] = useState("");

  async function toggle() {
    if (busy) return;
    const next = !on;
    if (!next && !isOwner) {
      setError("فقط مدیر می‌تواند تیک را بردارد");
      setTimeout(() => setError(""), 2500);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/properties/${propertyId}/appraise`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appraised: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(j.error || "خطا");
        setTimeout(() => setError(""), 2500);
        return;
      }
      setOn(next);
      setWho(
        next
          ? { name: j?.appraisedBy?.name || "", at: j?.appraisedAt || null }
          : null
      );
      onChanged?.();
    } catch {
      setError("خطا در ارتباط");
      setTimeout(() => setError(""), 2500);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className={`flex cursor-pointer select-none items-center gap-2 text-[13px] font-medium ${busy ? "opacity-60" : ""}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={busy}
          onChange={toggle}
          className="h-4 w-4 rounded accent-emerald-600"
        />
        کارشناسی
      </label>
      {on && who?.name && (
        <span className="text-[12px] text-[var(--ink-3)]">
          {who.name}{who.at ? ` · ${formatDate(who.at)}` : ""}
        </span>
      )}
      {error && <span className="text-[12px] text-red-600">{error}</span>}
    </div>
  );
}
