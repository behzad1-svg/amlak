// نمای «امروز» — صفحهٔ صبحگاهی مشاور: همهٔ کارهای امروز یکجا.
// Server Component مثل داشبورد: داده مستقیم از سرور، بدون fetch سمت کلاینت.
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionFromCookies } from "@/lib/auth";
import { getTodayData } from "@/lib/today";
import { prisma } from "@/lib/prisma";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, toFaDigits } from "@/lib/utils";
import { CUSTOMER_STAGE_LABELS } from "@/lib/constants";
import { TodayAgentFilter } from "@/components/today/TodayAgentFilter";
import { TodayBadge } from "@/components/ui/TodayBadge";
import { DateText } from "@/components/ui/DateText";

function formatTime(d: Date | string): string {
  return new Intl.DateTimeFormat("fa-IR", {
    timeZone: "Asia/Tehran",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(d));
}

function Section({
  title,
  total,
  empty,
  children,
}: {
  title: string;
  total: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Badge>{toFaDigits(String(total))} مورد</Badge>
      </div>
      {total === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">{empty}</p>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </Card>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ agentId?: string }>;
}) {
  const session = await getSessionFromCookies();
  if (!session) {
    const pathname = (await headers()).get("x-pathname") ?? "/today";
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }
  const isOwner = session.user.role === "OWNER";
  const params = await searchParams;
  const agentId = isOwner ? params.agentId ?? null : null;
  const data = await getTodayData(session.user.id, isOwner, agentId);
  const agents = isOwner
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <Header
        title="امروز"
        subtitle="کارهای امروزت — اول این‌ها را انجام بده"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <TodayBadge />
            {isOwner ? <TodayAgentFilter agents={agents} value={agentId} /> : null}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-4 max-w-3xl">
        <Section title="بازدیدهای امروز" total={data.viewingsToday.total} empty="برای امروز بازدیدی نداری.">
          {data.viewingsToday.items.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
              <Badge className="text-[11px]">{v.status === "DONE" ? "انجام شد" : "قرار بازدید"}</Badge>
              <span className="font-bold">{formatTime(v.startAt)}</span>
              <Link href={`/customers/${v.customerId}`} className="text-[var(--ink-2)] hover:underline">
                {v.customerName}
              </Link>
              <Link href={`/properties/${v.propertyId}`} className="text-[var(--ink-2)] hover:underline">
                {v.propertyTitle}
              </Link>
            </div>
          ))}
          {data.viewingsToday.total > data.viewingsToday.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.viewingsToday.total - data.viewingsToday.items.length))} مورد دیگر
            </p>
          )}
        </Section>

        <Section title="کارت‌های جلسهٔ امروز" total={data.sessionCardsToday.total} empty="برای امروز کارت جلسه‌ای نداری.">
          {data.sessionCardsToday.items.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
              <Badge className="text-[11px]">{s.status === "CONFIRMED" ? "تأیید شده" : "در انتظار"}</Badge>
              <span className="font-bold">{formatTime(s.scheduledAt)}</span>
              <Link href={`/customers/${s.customerId}`} className="text-[var(--ink-2)] hover:underline">
                {s.customerName}
              </Link>
              {s.propertyId && s.propertyTitle && (
                <Link href={`/properties/${s.propertyId}`} className="text-[var(--ink-2)] hover:underline">
                  {s.propertyTitle}
                </Link>
              )}
              {isOwner && <span className="text-[12px] text-[var(--ink-3)]">مشاور: {s.advisorName}</span>}
              <Link href="/session-cards" className="mr-auto text-[12px] text-[var(--sea)] hover:underline">
                کارت جلسه
              </Link>
            </div>
          ))}
          {data.sessionCardsToday.total > data.sessionCardsToday.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.sessionCardsToday.total - data.sessionCardsToday.items.length))} مورد دیگر
            </p>
          )}
        </Section>

        <Section title="پیگیری‌های عقب‌افتاده" total={data.overdueFollowUps.total} empty="پیگیری عقب‌افتاده‌ای نداری.">
          {data.overdueFollowUps.items.map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-3 py-2 text-[13px]">
              <Link href={`/customers/${f.customerId}`} className="font-bold text-[var(--ink)] hover:underline">
                {f.customerName}
              </Link>
              <span className="text-[12px] text-[var(--ink-3)]" dir="ltr">{f.customerPhone}</span>
              <span className="text-[12px] text-[var(--pomegranate)]">سررسید <DateText value={f.dueAt} /></span>
              {f.note && <span className="w-full text-[12px] text-[var(--ink-2)]">{f.note}</span>}
            </div>
          ))}
          {data.overdueFollowUps.total > data.overdueFollowUps.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.overdueFollowUps.total - data.overdueFollowUps.items.length))} مورد دیگر
            </p>
          )}
        </Section>

        <Section title="لیدهای بی‌جواب" total={data.unansweredLeads.total} empty="لید بی‌جوابی نداری.">
          {data.unansweredLeads.items.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
              <Link href={`/customers/${l.id}`} className="font-bold text-[var(--ink)] hover:underline">
                {l.name}
              </Link>
              <span className="text-[12px] text-[var(--ink-3)]" dir="ltr">{l.phone}</span>
              <Badge className="text-[11px]">{CUSTOMER_STAGE_LABELS[l.stage] ?? l.stage}</Badge>
              <span className="text-[12px] text-[var(--ink-3)]">
                {l.lastActivityAt
                  ? `${toFaDigits(String(l.daysSilent ?? 0))} روز بدون فعالیت`
                  : `از ثبت (${formatDate(l.createdAt)}) تماسی نشده`}
              </span>
            </div>
          ))}
          {data.unansweredLeads.total > data.unansweredLeads.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.unansweredLeads.total - data.unansweredLeads.items.length))} مورد دیگر
            </p>
          )}
        </Section>

        <Section title="فایل‌های بدون بازدید در ۳۰ روز" total={data.staleProperties.total} empty="همهٔ فایل‌ها در ۳۰ روز گذشته بازدید داشته‌اند.">
          {data.staleProperties.items.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
              <Link href={`/properties/${p.id}`} className="font-bold text-[var(--ink)] hover:underline">
                {p.code ? `${p.code} — ` : ""}{p.title}
              </Link>
              <span className="text-[12px] text-[var(--ink-3)]">{p.region}</span>
              <span className="text-[12px] text-[var(--ink-3)]">
                {p.lastViewedAt ? `آخرین بازدید ${formatDate(p.lastViewedAt)}` : "هرگز بازدید نشده"}
              </span>
            </div>
          ))}
          {data.staleProperties.total > data.staleProperties.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.staleProperties.total - data.staleProperties.items.length))} مورد دیگر
            </p>
          )}
        </Section>

        <Section title="بازدیدهای بدون گزارش" total={data.visitsAwaitingReport.total} empty="همهٔ بازدیدهای انجام‌شده گزارش دارند.">
          {data.visitsAwaitingReport.items.map((v) => (
            <div key={v.id} className="flex flex-wrap items-center gap-2 rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
              <DateText value={v.startAt} className="font-bold" />
              <Link href={`/customers/${v.customerId}`} className="text-[var(--ink-2)] hover:underline">
                {v.customerName}
              </Link>
              <Link href={`/properties/${v.propertyId}`} className="text-[var(--ink-2)] hover:underline">
                {v.propertyTitle}
              </Link>
              {isOwner && <span className="text-[12px] text-[var(--ink-3)]">مشاور: {v.agentName}</span>}
              <span className="mr-auto text-[12px] text-[var(--ink-3)]">گزارش را از صفحه فایل ثبت کن</span>
            </div>
          ))}
          {data.visitsAwaitingReport.total > data.visitsAwaitingReport.items.length && (
            <p className="text-[12px] text-[var(--ink-3)]">
              و {toFaDigits(String(data.visitsAwaitingReport.total - data.visitsAwaitingReport.items.length))} مورد دیگر
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
