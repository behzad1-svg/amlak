"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiJson, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";

type PerfRow = {
  id: string;
  name: string;
  role: string;
  active: boolean;
  files: number;
  appraisals: number;
  advertised: number;
  sessionCards: number;
  fileFindings: number;
  viewings: number;
  deals: number;
  overdue: number;
};

type PerfData = {
  range: number;
  since: string;
  users: PerfRow[];
  totals: { files: number; appraisals: number; advertised: number; sessionCards: number; fileFindings: number; viewings: number; deals: number; overdue: number };
};

const METRICS = [
  { key: "files" as const, label: "فایل ثبت‌شده", color: "bg-[var(--sea)]" },
  { key: "appraisals" as const, label: "کارشناسی", color: "bg-emerald-500" },
  { key: "advertised" as const, label: "آگهی", color: "bg-violet-500" },
  { key: "sessionCards" as const, label: "کارت جلسه", color: "bg-teal-500" },
  { key: "fileFindings" as const, label: "فایل‌یابی", color: "bg-amber-500" },
  { key: "viewings" as const, label: "بازدید", color: "bg-sky-500" },
  { key: "deals" as const, label: "قرارداد", color: "bg-[var(--pomegranate)]" },
] as const;

function BarChart({ title, rows, valueKey, color }: { title: string; rows: PerfRow[]; valueKey: (typeof METRICS)[number]["key"]; color: string }) {
  const sorted = [...rows].sort((a, b) => b[valueKey] - a[valueKey]);
  const max = Math.max(1, ...sorted.map((r) => r[valueKey]));
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {sorted.length === 0 || sorted.every((r) => r[valueKey] === 0) ? (
        <p className="text-sm text-[var(--ink-3)]">در این بازه موردی ثبت نشده است.</p>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-28 shrink-0 truncate font-medium">{r.name}{r.role === "OWNER" ? " (مدیر)" : ""}{r.active === false ? " (غیرفعال)" : ""}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-full bg-[var(--paper-2)]">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(r[valueKey] > 0 ? 4 : 0, (r[valueKey] / max) * 100)}%` }} />
              </div>
              <span className="w-8 shrink-0 text-left font-bold">{toFaDigits(String(r[valueKey]))}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function ReportsPage() {
  const { isOwner, loading: roleLoading } = useRole();
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<PerfData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async (r: number) => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await apiJson<PerfData>(`/api/reports/performance?range=${r}`);
      setData(d);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch the report only after the role is known — otherwise every visit
  // would fire an extra request.
  useEffect(() => {
    if (roleLoading) return;
    void (async () => {
      await load(range);
    })();
  }, [range, roleLoading, load]);

  if (roleLoading) return <PageSkeleton rows={4} />;
  if (loading) return <PageSkeleton rows={4} />;
  if (loadError || !data) return <PageError message={loadError ?? "داده بارگذاری نشد."} onRetry={() => load(range)} />;

  const t = data.totals;
  return (
    <div>
      <Header
        title="گزارش عملکرد"
        subtitle={isOwner ? `عملکرد مشاوران در ${toFaDigits(String(data.range))} روز گذشته — به تفکیک هر مشاور` : `عملکرد شما در ${toFaDigits(String(data.range))} روز گذشته`}
        action={
          <div className="flex gap-2">
            {([7, 30, 90] as const).map((r) => (
              <Button key={r} size="sm" variant={range === r ? "primary" : "outline"} onClick={() => setRange(r)}>
                {toFaDigits(String(r))} روز
              </Button>
            ))}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-6 max-w-[1200px]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {([
            ["فایل ثبت‌شده", t.files],
            ["کارشناسی", t.appraisals],
            ["آگهی", t.advertised],
            ["کارت جلسه", t.sessionCards],
            ["فایل‌یابی", t.fileFindings],
            ["بازدید", t.viewings],
            ["قرارداد", t.deals],
            ["پیگیری عقب‌افتاده", t.overdue],
          ] as const).map(([label, n]) => (
            <div key={label} className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">{label}</div>
              <div className="text-[20px] font-extrabold">{toFaDigits(String(n))}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {METRICS.map((m) => (
            <BarChart key={m.key} title={m.label} rows={data.users} valueKey={m.key} color={m.color} />
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>جزئیات به تفکیک مشاور</CardTitle></CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-zinc-500 text-[12px]">
                  <th className="py-2 text-right">مشاور</th>
                  <th>فایل ثبت‌شده</th>
                  <th>کارشناسی</th>
                  <th>آگهی</th>
                  <th>کارت جلسه</th>
                  <th>فایل‌یابی</th>
                  <th>بازدید</th>
                  <th>قرارداد</th>
                  <th>پیگیری عقب‌افتاده</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className="py-2.5 pr-2 font-medium text-right">{u.name} {u.role === "OWNER" ? "(مدیر)" : ""}{u.active === false ? " (غیرفعال)" : ""}</td>
                    <td className="text-center">{toFaDigits(String(u.files))}</td>
                    <td className="text-center font-bold text-[var(--sea)]">{toFaDigits(String(u.appraisals))}</td>
                    <td className="text-center font-bold text-violet-700">{toFaDigits(String(u.advertised))}</td>
                    <td className="text-center font-bold text-teal-700">{toFaDigits(String(u.sessionCards))}</td>
                    <td className="text-center">{toFaDigits(String(u.fileFindings))}</td>
                    <td className="text-center">{toFaDigits(String(u.viewings))}</td>
                    <td className="text-center font-bold">{toFaDigits(String(u.deals))}</td>
                    <td className="text-center">
                      <span className={u.overdue > 0 ? "text-red-600 font-bold" : ""}>{toFaDigits(String(u.overdue))}</span>
                    </td>
                  </tr>
                ))}
                <tr className="font-bold bg-[var(--paper-2)]">
                  <td className="py-2.5 pr-2 text-right">جمع کل</td>
                  <td className="text-center">{toFaDigits(String(t.files))}</td>
                  <td className="text-center">{toFaDigits(String(t.appraisals))}</td>
                  <td className="text-center">{toFaDigits(String(t.advertised))}</td>
                  <td className="text-center">{toFaDigits(String(t.sessionCards))}</td>
                  <td className="text-center">{toFaDigits(String(t.fileFindings))}</td>
                  <td className="text-center">{toFaDigits(String(t.viewings))}</td>
                  <td className="text-center">{toFaDigits(String(t.deals))}</td>
                  <td className="text-center">{toFaDigits(String(t.overdue))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-[var(--ink-3)]">
            «قرارداد» یعنی معامله قطعی‌شده؛ «بازدید» بازدیدهای لغونشده در بازه است؛ «پیگیری عقب‌افتاده» وضعیت امروز است، نه مربوط به بازه. «آگهی» تعداد دفعاتی است که مشاور در بازه فایلی را آگهی کرده است (هر فایل در هر روز یک بار). «کارت جلسه» تعداد کارت‌های جلسه‌ای است که مشاور در بازه ثبت کرده است (به نام سازندهٔ کارت).
          </p>
        </Card>
      </div>
    </div>
  );
}
