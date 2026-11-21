// گزارش سه‌ضربه‌ای بازدید — بعد از بازدید انجام‌شده، مشاور با یک ضربه نظر
// مشتری را ثبت می‌کند (خوشش آمد / متوسط / خوشش نیامد) + یک جمله نظر اختیاری.
// زیر ۱۰ ثانیه؛ بدون آن، بازخورد بازدیدها هیچ‌وقت نوشته نمی‌شود.
"use client";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { VISIT_RATING_LABELS, VISIT_RATING_COLORS } from "@/lib/constants";
import { apiJson, errorMessage } from "@/lib/api";

export type VisitRating = "LIKED" | "MIXED" | "NOT_INTERESTED";

export type ReportableViewing = {
  id: string;
  status: string;
  rating?: string | null;
  reportComment?: string | null;
};

const RATING_OPTIONS: VisitRating[] = ["LIKED", "MIXED", "NOT_INTERESTED"];

export function VisitRatingBadge({ rating }: { rating: string }) {
  return (
    <Badge className={VISIT_RATING_COLORS[rating] ?? ""}>
      {VISIT_RATING_LABELS[rating] ?? rating}
    </Badge>
  );
}

/** دکمه‌های انتخاب نظر برای فرم ثبت بازدید (وقتی وضعیت «انجام شد» است) */
export function VisitRatingPicker({
  value,
  onChange,
}: {
  value: VisitRating | "";
  onChange: (r: VisitRating | "") => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {RATING_OPTIONS.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(value === r ? "" : r)}
          aria-pressed={value === r}
          className={`rounded-md border px-3 py-1.5 text-[13px] font-medium ${
            value === r
              ? "border-[var(--ink)] bg-[var(--ink)] text-white"
              : "border-[var(--line)] bg-white text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
          }`}
        >
          {VISIT_RATING_LABELS[r]}
        </button>
      ))}
    </div>
  );
}

export function VisitReportButtons({
  viewing,
  onReported,
}: {
  viewing: ReportableViewing;
  onReported: (v: ReportableViewing) => void;
}) {
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (viewing.status !== "DONE") return null;

  async function report(rating: VisitRating) {
    setSaving(rating);
    setError("");
    try {
      const updated = await apiJson<ReportableViewing>(`/api/viewings/${viewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, reportComment: comment.trim() || null }),
      });
      onReported({ ...viewing, rating: updated.rating, reportComment: updated.reportComment });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  async function addComment() {
    if (!comment.trim()) return;
    setSaving("comment");
    setError("");
    try {
      const updated = await apiJson<ReportableViewing>(`/api/viewings/${viewing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportComment: comment.trim() }),
      });
      onReported({ ...viewing, reportComment: updated.reportComment });
      setComment("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  if (viewing.rating) {
    return (
      <div className="mt-1.5">
        <span className="flex flex-wrap items-center gap-2 text-[12px]">
          <VisitRatingBadge rating={viewing.rating} />
          {viewing.reportComment && (
            <span className="text-[var(--ink-2)]">«{viewing.reportComment}»</span>
          )}
        </span>
        {!viewing.reportComment && (
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="یک جمله نظر (اختیاری)"
              className="w-56"
            />
            <button
              type="button"
              disabled={!comment.trim() || saving !== null}
              onClick={() => void addComment()}
              className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px] font-medium hover:bg-[var(--paper-2)] disabled:opacity-50"
            >
              {saving === "comment" ? "..." : "ثبت نظر"}
            </button>
          </span>
        )}
        {error && (
          <p className="mt-1 text-[12px] text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-medium text-[var(--ink-3)]">نظر مشتری:</span>
        {RATING_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            disabled={saving !== null}
            onClick={() => void report(r)}
            className="rounded-md border border-[var(--line)] bg-white px-2.5 py-1.5 text-[12px] font-medium hover:bg-[var(--paper-2)] disabled:opacity-50"
          >
            {saving === r ? "..." : VISIT_RATING_LABELS[r]}
          </button>
        ))}
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="یک جمله نظر (اختیاری)"
          className="w-56"
        />
      </div>
      {error && (
        <p className="mt-1 text-[12px] text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
