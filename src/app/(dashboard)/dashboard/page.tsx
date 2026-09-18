"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate } from "@/lib/utils";
import { CUSTOMER_STAGE_LABELS } from "@/lib/constants";
import { AlertTriangle, Clock, Calendar, Users, ArrowUpLeft, Eye } from "lucide-react";

type DashboardData = {
  overdueCustomers: { id: string; name: string; phone: string; stage: string; nextFollowUpAt: string }[];
  todayFollowUps: { id: string; name: string; nextFollowUpAt: string }[];
  needsReview: { id: string; name: string; managerReviewReason: string | null }[];
  tasks: { id: string; title: string; dueAt: string | null }[];
  viewings: { id: string; startAt: string; customer: { name: string }; property: { title: string } }[];
  teamStats: { id: string; name: string; role: string; overdue: number; weeklyActivity: number; monthlyActivity: number; deals: number }[] | null;
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  useEffect(() => { fetch("/api/dashboard").then((r) => r.json()).then(setData); }, []);
  if (!data) return <div className="p-8 text-center text-[13px] text-[var(--ink-3)]">در حال بارگذاری...</div>;

  const overdue = data.overdueCustomers ?? [];
  const today = data.todayFollowUps ?? [];
  const needsReview = data.needsReview ?? [];
  const viewings = data.viewings ?? [];
  const teamStats = data.teamStats;

  return (
    <div>
      <Header title="داشبورد" subtitle="نگاه امروز — چه چیزی عقب افتاده، چه چیزی در نوبت است" />

      <div className="p-6 space-y-6 max-w-[1120px]">
        {/* Stats strip — the memorable one element */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-[16px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] p-4">
            <div className="text-[11px] tracking-widest text-[var(--pomegranate)]">عقب‌افتاده</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight text-[var(--pomegranate)]">{overdue.length}</span>
              <span className="text-[12px] text-[var(--pomegranate)]/70">مورد</span>
            </div>
            <div className="mt-2 h-1 rounded-full bg-[var(--pomegranate)]/15"><div className="h-1 rounded-full bg-[var(--pomegranate)]" style={{ width: `${Math.min(100, overdue.length * 18)}%` }} /></div>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
            <div className="text-[11px] tracking-widest text-[var(--ink-3)]">پیگیری امروز</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{today.length}</span>
              <span className="text-[12px] text-[var(--ink-3)]">مورد</span>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--ink-3)]">تا پایان امروز</div>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
            <div className="text-[11px] tracking-widest text-[var(--ink-3)]">نیاز به بررسی</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{needsReview.length}</span>
              <span className="text-[12px] text-[var(--ink-3)]">مورد</span>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--ink-3)]">برای مدیر</div>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
            <div className="text-[11px] tracking-widest text-[var(--ink-3)]">بازدید امروز</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{viewings.length}</span>
              <span className="text-[12px] text-[var(--ink-3)]">بازدید</span>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--ink-3)]">ثبت‌شده</div>
          </div>
        </div>

        {/* Overdue — urgent ledger */}
        {overdue.length > 0 ? (
          <Card className="border-[var(--pomegranate-line)] bg-white p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--pomegranate)] text-white"><AlertTriangle className="h-4 w-4" /></span>
                <span className="text-[13px] font-extrabold tracking-tight text-[var(--pomegranate)]">پیگیری عقب‌افتاده</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--pomegranate)] border border-[var(--pomegranate-line)]">{overdue.length}</span>
              </div>
              <Link href="/customers" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--pomegranate)] hover:underline">دیدن همه <ArrowUpLeft className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {overdue.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--paper-2)] transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[var(--pomegranate)]" />
                      <span className="text-[13.5px] font-bold truncate">{c.name}</span>
                      <span className="text-[12px] text-[var(--ink-3)]" dir="ltr">{c.phone}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
                      <Badge className="bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)]">{CUSTOMER_STAGE_LABELS[c.stage] ?? c.stage}</Badge>
                      <span>پیگیری: {formatDate(c.nextFollowUpAt)}</span>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium"><Eye className="h-3.5 w-3.5" /> مشاهده</span>
                </Link>
              ))}
            </div>
          </Card>
        ) : (
          <div className="rounded-[16px] border border-[var(--line)] bg-white px-4 py-4 flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-[12px] bg-[var(--sea-soft)] text-[var(--sea)]">✓</span>
            <div>
              <div className="text-[13px] font-bold">چیزی عقب نیفتاده</div>
              <div className="text-[12px] text-[var(--ink-3)]">همه پیگیری‌ها به‌روز است — عالیه.</div>
            </div>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white"><Clock className="h-4 w-4" /></span> پیگیری امروز</CardTitle>
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{today.length}</span>
            </CardHeader>
            <div className="px-2 pb-2">
              {today.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-[var(--ink-3)]">موردی برای امروز نیست.</p> : today.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between rounded-[12px] px-3 py-2.5 hover:bg-[var(--paper-2)]">
                  <span className="text-[13.5px] font-medium">{c.name}</span><span className="text-[12px] text-[var(--ink-3)]">{formatDate(c.nextFollowUpAt)}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white border border-[var(--line)]"><Calendar className="h-4 w-4" /></span> بازدیدهای امروز</CardTitle>
              <Link href="/viewings" className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)]">همه بازدیدها</Link>
            </CardHeader>
            <div className="px-2 pb-2">
              {viewings.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-[var(--ink-3)]">بازدیدی برای امروز ثبت نشده.</p> : viewings.map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13px]">
                  <span>{v.customer?.name} — {v.property?.title}</span><span className="text-[12px] text-[var(--ink-3)]">{formatDate(v.startAt)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {needsReview.length > 0 && (
          <Card className="border-[#F1D9A8] bg-[var(--amber-soft)] p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F1D9A8] flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-[var(--amber)]">نیاز به بررسی مدیر</span>
              <span className="rounded-full bg-white border border-[#F1D9A8] px-2 py-0.5 text-[11px] font-bold text-[var(--amber)]">{needsReview.length}</span>
            </div>
            <div className="divide-y divide-[#F1D9A8]/60">
              {needsReview.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-white/60">
                  <span className="text-[13.5px] font-medium">{c.name}</span>
                  <span className="text-[12px] text-[var(--ink-2)] max-w-[260px] truncate">{c.managerReviewReason ?? "—"}</span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-0 overflow-hidden">
          <CardHeader className="px-4 pt-4">
            <CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white border border-[var(--line)]"><Calendar className="h-4 w-4" /></span> بازدیدهای امروز</CardTitle>
            <Link href="/viewings" className="text-[11px] font-medium text-[var(--ink-3)] hover:text-[var(--ink)]">همه بازدیدها</Link>
          </CardHeader>
          <div className="px-2 pb-2">
            {viewings.length === 0 ? <p className="px-3 py-6 text-center text-[13px] text-[var(--ink-3)]">بازدیدی برای امروز ثبت نشده.</p> : viewings.map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-[12px] px-3 py-2.5 text-[13px]">
                <span>{v.customer?.name} — {v.property?.title}</span><span className="text-[12px] text-[var(--ink-3)]">{formatDate(v.startAt)}</span>
              </div>
            ))}
          </div>
        </Card>

        {teamStats && (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white"><Users className="h-4 w-4" /></span>
              <span className="text-[13px] font-extrabold">وضعیت تیم</span>
              <span className="mr-auto text-[11px] tracking-widest text-[var(--ink-3)]">هفتگی · ماهانه</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[var(--paper-2)] text-[11px] tracking-widest text-[var(--ink-3)]">
                    <th className="py-2.5 pr-4 text-right font-medium">مشاور</th>
                    <th className="py-2.5 text-center font-medium">عقب‌افتاده</th>
                    <th className="py-2.5 text-center font-medium">هفتگی</th>
                    <th className="py-2.5 text-center font-medium">ماهانه</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {teamStats.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--paper-2)]/60">
                      <td className="py-3 pr-4 font-medium">{s.name} {s.role === "OWNER" ? <span className="mr-1 rounded-full bg-[var(--ink)] px-1.5 py-0.5 text-[10px] text-white">مدیر</span> : null}</td>
                      <td className="text-center"><span className={s.overdue > 0 ? "inline-flex min-w-6 justify-center rounded-full bg-[var(--pomegranate-soft)] border border-[var(--pomegranate-line)] px-2 py-0.5 text-[var(--pomegranate)] font-bold" : "text-[var(--ink-3)]"}>{s.overdue}</span></td>
                      <td className="text-center text-[var(--ink-2)]">{s.weeklyActivity}</td>
                      <td className="text-center text-[var(--ink-2)]">{s.monthlyActivity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
