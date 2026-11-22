// نقد ۹ — داشبورد حالا Server Component است: داده مستقیم از سرور خوانده می‌شود،
// بدون fetch سمت کلاینت و بدون «در حال بارگذاری...» که شبیه خالی بودن بود.
// خطا را error.tsx می‌گیرد و بارگذاری را loading.tsx با اسکلت نشان می‌دهد.
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionFromCookies } from "@/lib/auth";
import { getDashboardData, type DashboardDaySchedule } from "@/lib/dashboard";
import { formatJalaliDayMonth, getTehranWeekdayLong } from "@/lib/jalali";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CUSTOMER_STAGE_LABELS } from "@/lib/constants";
import { AlertTriangle, Users, ArrowUpLeft, Eye, CalendarCheck, ListChecks } from "lucide-react";
import { AdvertiseTodayCard } from "@/components/dashboard/AdvertiseTodayCard";
import { CommissionCalculator } from "@/components/dashboard/CommissionCalculator";
import { TodayBadge } from "@/components/ui/TodayBadge";
import { DateText } from "@/components/ui/DateText";

// کارت برنامهٔ یک روز آینده (فردا / پس‌فردا): بازدیدها، کارت‌های جلسه و
// پیگیری‌های سررسید آن روز. اگر روز خالی باشد، خالی بودنش با جملهٔ واضح
// گفته می‌شود؛ اگر فقط بخشی خالی باشد، همان بخش «نیست» می‌خورد.
// accent با CSS دستی: قرمز (اناری) برای امروز، آبی برای فردا/پس‌فردا.
function DayScheduleCard({ title, schedule, accent }: { title: string; schedule: DashboardDaySchedule; accent: "red" | "blue" }) {
  const total = schedule.viewings.length + schedule.sessionCards.length + schedule.followUpsTotal;
  const dateLabel = `${getTehranWeekdayLong(schedule.dayStart)} ${formatJalaliDayMonth(schedule.dayStart)}`;
  const isToday = accent === "red";
  return (
    <Card className={isToday ? "p-0 overflow-hidden border-[var(--pomegranate-line)]" : "p-0 overflow-hidden"}>
      <CardHeader className="px-4 pt-4">
        <CardTitle className="flex items-center gap-2"><span className={isToday ? "flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--pomegranate)] text-white" : "flex h-7 w-7 items-center justify-center rounded-[10px] bg-blue-600 text-white"}><CalendarCheck className="h-4 w-4" /></span> <span className={isToday ? "text-[var(--pomegranate)]" : undefined}>{title}</span></CardTitle>
        <span className={isToday ? "rounded-full border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--pomegranate)]" : "rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold"}>{dateLabel}</span>
        <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{total}</span>
      </CardHeader>
      <div className="px-4 pb-4">
        {total === 0 ? (
          <p className="py-6 text-center text-[13px] text-[var(--ink-3)]">برای {title} چیزی برنامه‌ریزی نشده است.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-[var(--ink-2)]">بازدیدها</span>
                <span className="text-[11px] text-[var(--ink-3)]">{schedule.viewings.length} مورد</span>
              </div>
              {schedule.viewings.length === 0 ? (
                <p className="text-[12px] text-[var(--ink-3)]">بازدیدی نیست.</p>
              ) : (
                schedule.viewings.map((v) => (
                  <div key={v.id} className="mb-1 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--paper-2)] px-3 py-2 last:mb-0">
                    <span className="min-w-0 truncate text-[13px] font-medium">{v.customer.name} — {v.property.title}</span>
                    <span className="shrink-0 text-[12px] text-[var(--ink-3)]"><DateText value={v.startAt} withTime /></span>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-[var(--ink-2)]">کارت‌های جلسه</span>
                <span className="text-[11px] text-[var(--ink-3)]">{schedule.sessionCards.length} مورد</span>
              </div>
              {schedule.sessionCards.length === 0 ? (
                <p className="text-[12px] text-[var(--ink-3)]">کارت جلسه‌ای نیست.</p>
              ) : (
                schedule.sessionCards.map((s) => (
                  <div key={s.id} className="mb-1 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--paper-2)] px-3 py-2 last:mb-0">
                    <span className="min-w-0 truncate text-[13px] font-medium">{s.customer.name}{s.property ? ` — ${s.property.title}` : ""}</span>
                    <span className="shrink-0 text-[12px] text-[var(--ink-3)]"><DateText value={s.scheduledAt} withTime /></span>
                  </div>
                ))
              )}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[12px] font-bold text-[var(--ink-2)]">پیگیری‌ها</span>
                <span className="text-[11px] text-[var(--ink-3)]">{schedule.followUpsTotal} مورد</span>
              </div>
              {schedule.followUps.length === 0 ? (
                <p className="text-[12px] text-[var(--ink-3)]">پیگیری‌ای نیست.</p>
              ) : (
                schedule.followUps.map((c) => (
                  <Link key={c.id} href={`/customers/${c.id}`} className="mb-1 flex items-center justify-between gap-3 rounded-[12px] bg-[var(--paper-2)] px-3 py-2 last:mb-0">
                    <span className="min-w-0 truncate text-[13px] font-medium">{c.name}</span>
                    <span className="shrink-0 text-[12px] text-[var(--ink-3)]"><DateText value={c.nextFollowUpAt} withTime /></span>
                  </Link>
                ))
              )}
              {schedule.followUpsTotal > schedule.followUps.length && (
                <p className="pt-1 text-center text-[12px] text-[var(--ink-3)]">نمایش {schedule.followUps.length} از {schedule.followUpsTotal} مورد</p>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export default async function DashboardPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }
  const data = await getDashboardData(session.user.id, session.user.role === "OWNER");

  const overdue = data.overdueCustomers;
  const needsReview = data.needsReview;
  const teamStats = data.teamStats;
  const tasks = data.tasks;

  return (
    <div>
      <Header title="داشبورد" subtitle="نگاه امروز — چه چیزی عقب افتاده، چه چیزی در نوبت است" action={<TodayBadge />} />

      <div className="p-4 sm:p-6 space-y-6 max-w-[1120px]">
        {/* Stats strip — شمارنده‌ها تعداد واقعی‌اند، نه طول لیست بریده‌شده */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-[16px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] p-4">
            <div className="text-[11px] text-[var(--pomegranate)]">عقب‌افتاده</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight text-[var(--pomegranate)]">{data.overdueTotal}</span>
              <span className="text-[12px] text-[var(--pomegranate)]/70">مورد</span>
            </div>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
            <div className="text-[11px] text-[var(--ink-3)]">پیگیری امروز</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{data.todayTotal}</span>
              <span className="text-[12px] text-[var(--ink-3)]">مورد</span>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--ink-3)]">تا پایان امروز</div>
          </div>
          <div className="rounded-[16px] border border-[var(--line)] bg-white p-4">
            <div className="text-[11px] text-[var(--ink-3)]">نیاز به بررسی</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-extrabold leading-none tracking-tight">{data.needsReviewTotal}</span>
              <span className="text-[12px] text-[var(--ink-3)]">مورد</span>
            </div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--ink-3)]">برای مدیر</div>
          </div>
        </div>

        {/* Overdue — urgent ledger */}
        {overdue.length > 0 ? (
          <Card className="border-[var(--pomegranate-line)] bg-white p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--pomegranate)] text-white"><AlertTriangle className="h-4 w-4" /></span>
                <span className="text-[13px] font-extrabold tracking-tight text-[var(--pomegranate)]">پیگیری عقب‌افتاده</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[var(--pomegranate)] border border-[var(--pomegranate-line)]">{data.overdueTotal}</span>
              </div>
              <Link href="/customers" className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--pomegranate)] hover:underline">دیدن همه <ArrowUpLeft className="h-3.5 w-3.5" /></Link>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {overdue.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--paper-2)] transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--pomegranate)]" />
                      <span className="min-w-0 text-[13.5px] font-bold truncate">{c.name}</span>
                      <span className="shrink-0 whitespace-nowrap text-[12px] text-[var(--ink-3)]" dir="ltr">{c.phone}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
                      <Badge className="bg-[var(--pomegranate-soft)] text-[var(--pomegranate)] border-[var(--pomegranate-line)]">{CUSTOMER_STAGE_LABELS[c.stage] ?? c.stage}</Badge>
                      <span>پیگیری: <DateText value={c.nextFollowUpAt} withTime /></span>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-[11px] font-medium"><Eye className="h-3.5 w-3.5" /> مشاهده</span>
                </Link>
              ))}
            </div>
            {data.overdueTotal > overdue.length && (
              <div className="border-t border-[var(--line)] bg-[var(--paper-2)] px-4 py-2.5 text-center text-[12px] text-[var(--ink-3)]">
                نمایش {overdue.length} از {data.overdueTotal} مورد — برای دیدن بقیه به صفحهٔ مشتریان بروید.
              </div>
            )}
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

        {/* برنامهٔ سه روز — امروز یکپارچه با تأکید قرمز، فردا و پس‌فردا آبی */}
        <div className="grid gap-4 lg:grid-cols-3">
          <DayScheduleCard title="امروز" schedule={data.today} accent="red" />
          <DayScheduleCard title="فردا" schedule={data.tomorrow} accent="blue" />
          <DayScheduleCard title="پس‌فردا" schedule={data.dayAfter} accent="blue" />
        </div>

        <AdvertiseTodayCard />

        {tasks.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 pt-4">
              <CardTitle className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white"><ListChecks className="h-4 w-4" /></span> کارهای باز من</CardTitle>
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{tasks.length}</span>
            </CardHeader>
            <div className="px-2 pb-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-[12px] px-3 py-2.5 hover:bg-[var(--paper-2)]">
                  <span className="min-w-0 truncate text-[13.5px] font-medium">{t.title}</span>
                  <span className="shrink-0 text-[12px] text-[var(--ink-3)]">{t.dueAt ? <DateText value={t.dueAt} /> : "بدون مهلت"}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {needsReview.length > 0 && (
          <Card className="border-[#F1D9A8] bg-[var(--amber-soft)] p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[#F1D9A8] flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-[var(--amber)]">نیاز به بررسی مدیر</span>
              <span className="rounded-full bg-white border border-[#F1D9A8] px-2 py-0.5 text-[11px] font-bold text-[var(--amber)]">{data.needsReviewTotal}</span>
            </div>
            <div className="divide-y divide-[#F1D9A8]/60">
              {needsReview.map((c) => (
                <Link key={c.id} href={`/customers/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/60">
                  <span className="min-w-0 truncate text-[13.5px] font-medium">{c.name}</span>
                  <span className="shrink-0 text-[12px] text-[var(--ink-2)] max-w-[160px] truncate sm:max-w-[260px]">{c.managerReviewReason ?? "—"}</span>
                </Link>
              ))}
            </div>
            {data.needsReviewTotal > needsReview.length && (
              <div className="border-t border-[#F1D9A8] bg-white/60 px-4 py-2.5 text-center text-[12px] text-[var(--ink-3)]">
                نمایش {needsReview.length} از {data.needsReviewTotal} مورد
              </div>
            )}
          </Card>
        )}

        {teamStats && (
          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--line)] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-[var(--ink)] text-white"><Users className="h-4 w-4" /></span>
              <span className="text-[13px] font-extrabold">وضعیت تیم</span>
              <span className="mr-auto text-[11px] text-[var(--ink-3)]">هفتگی · ماهانه · آگهی هفته · کارت جلسه هفته</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-[var(--paper-2)] text-[11px] text-[var(--ink-3)]">
                    <th className="py-2.5 pr-4 text-right font-medium">مشاور</th>
                    <th className="py-2.5 text-center font-medium">عقب‌افتاده</th>
                    <th className="py-2.5 text-center font-medium">هفتگی</th>
                    <th className="py-2.5 text-center font-medium">ماهانه</th>
                    <th className="py-2.5 text-center font-medium">آگهی هفته</th>
                    <th className="py-2.5 text-center font-medium">کارت جلسه هفته</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {teamStats.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--paper-2)]/60">
                      <td className="py-3 pr-4 font-medium">{s.name} {s.role === "OWNER" ? <span className="mr-1 rounded-full bg-[var(--ink)] px-1.5 py-0.5 text-[10px] text-white">مدیر</span> : null}</td>
                      <td className="text-center"><span className={s.overdue > 0 ? "inline-flex min-w-6 justify-center rounded-full bg-[var(--pomegranate-soft)] border border-[var(--pomegranate-line)] px-2 py-0.5 text-[var(--pomegranate)] font-bold" : "text-[var(--ink-3)]"}>{s.overdue}</span></td>
                      <td className="text-center text-[var(--ink-2)]">{s.weeklyActivity}</td>
                      <td className="text-center text-[var(--ink-2)]">{s.monthlyActivity}</td>
                      <td className="text-center font-bold text-violet-700">{s.advertisedWeekly}</td>
                      <td className="text-center font-bold text-teal-700">{s.sessionCardsWeekly}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <CommissionCalculator />
      </div>
    </div>
  );
}
