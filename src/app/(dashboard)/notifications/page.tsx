// نقد ۱ — اعلان‌ها با کمک‌کنندهٔ مرکزی: خطای بارگذاری پیام + تلاش دوباره دارد،
// و «اعلانی ندارید» فقط وقتی نشان داده می‌شود که بارگذاری واقعاً تمام شده باشد.
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDate, toFaDigits } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  FOLLOW_UP_OVERDUE: "پیگیری",
  VIEWING_REMINDER: "بازدید",
  ACCESS_GRANTED: "دسترسی",
  CUSTOMER_TRANSFERRED: "انتقال",
  SESSION_CARD: "کارت جلسه",
  ADVERTISED: "آگهی",
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "مهم",
  NORMAL: "معمولی",
  LOW: "کم‌اهمیت",
};

const TYPE_FILTERS = [
  { key: "all", label: "همه" },
  { key: "FOLLOW_UP_OVERDUE", label: "پیگیری" },
  { key: "VIEWING_REMINDER", label: "بازدید" },
  { key: "ACCESS_GRANTED", label: "دسترسی" },
  { key: "CUSTOMER_TRANSFERRED", label: "انتقال" },
  { key: "SESSION_CARD", label: "کارت جلسه" },
  { key: "ADVERTISED", label: "آگهی" },
] as const;

type NotificationRow = {
  id: string;
  message: string;
  type: string;
  priority: string;
  read: boolean;
  createdAt: string;
  relatedId: string | null;
  relatedType: string | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [list, setList] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");
  const [actionOk, setActionOk] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [quickSaving, setQuickSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // تطبیق‌ها بخش جداگانه خودشان را دارند (صفحه «تطبیق») و اینجا نشان داده نمی‌شوند.
      const d = await apiJson<{ notifications?: NotificationRow[] }>("/api/notifications?limit=100&excludeType=MATCH_SUGGESTION");
      setList(d.notifications ?? []);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // بارگذاری اولیهٔ داده — الگوی استاندارد صفحه‌های کلاینتی
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function markAll() {
    setActionError("");
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true, excludeType: "MATCH_SUGGESTION" }),
      });
      load();
      // بج اعلان‌ها در سایدبار از لی‌اوت سروری می‌آید؛ بدون رفرش، عددش کهنه می‌ماند.
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  async function markOne(id: string) {
    setActionError("");
    try {
      await apiFetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      load();
      // بج اعلان‌ها در سایدبار از لی‌اوت سروری می‌آید؛ بدون رفرش، عددش کهنه می‌ماند.
      router.refresh();
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  function isoInDays(n: number): string {
    return new Date(Date.now() + n * 86_400_000).toISOString();
  }

  // ثبت سریع نتیجه تماس از داخل اعلان پیگیری: تماس ثبت می‌شود، پیگیری
  // بعدی به فردا می‌رود و اعلان خوانده می‌شود.
  async function quickCalled(n: NotificationRow) {
    if (!n.relatedId || quickSaving) return;
    setQuickSaving(n.id);
    setActionError("");
    setActionOk("");
    try {
      await apiFetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CALL", customerId: n.relatedId, description: "تماس: جواب داد" }),
      });
      await apiFetch(`/api/customers/${n.relatedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextFollowUpAt: isoInDays(1) }),
      });
      await markOne(n.id);
      setActionOk("تماس ثبت شد؛ پیگیری بعدی فردا تنظیم شد.");
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setQuickSaving(null);
    }
  }

  const filtered = typeFilter === "all" ? list : list.filter((n) => n.type === typeFilter);

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <PageError message={loadError} onRetry={load} />;

  return (
    <div>
      <Header title="اعلان‌ها" action={<Button variant="outline" onClick={markAll}>همه خوانده شد</Button>} />
      <div className="p-4 sm:p-6 space-y-3 max-w-3xl">
        {actionError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionError}</div>
        )}
        {actionOk && (
          <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700" role="status">{actionOk}</div>
        )}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((f) => (
            <Button key={f.key} size="sm" variant={typeFilter === f.key ? "primary" : "outline"} onClick={() => setTypeFilter(f.key)}>
              {f.label}
              {f.key !== "all" && ` (${toFaDigits(String(list.filter((n) => n.type === f.key).length))})`}
            </Button>
          ))}
        </div>
        {filtered.length === 0 ? <p className="text-zinc-400">{list.length === 0 ? "اعلانی ندارید" : "در این دسته اعلانی ندارید"}</p> : filtered.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-60" : "border-amber-200 bg-amber-50/30"}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-1"><Badge className={n.priority === "HIGH" ? "bg-red-100 text-red-700 border-red-200" : ""}>{PRIORITY_LABELS[n.priority] ?? n.priority}</Badge><Badge>{TYPE_LABELS[n.type] ?? n.type}</Badge></div>
                <p className="text-sm break-words">{n.message}</p>
                <p className="text-xs text-zinc-400 mt-1">{formatDate(n.createdAt)}</p>
                {n.relatedId && n.relatedType && (
                  <Link
                    href={n.relatedType === "Property" ? `/properties/${n.relatedId}` : n.relatedType === "Customer" ? `/customers/${n.relatedId}` : n.relatedType === "SessionCard" ? "/session-cards" : "/viewings"}
                    className="mt-2 inline-block rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                  >
                    {n.relatedType === "Property" ? "مشاهده فایل" : n.relatedType === "Customer" ? "مشاهده مشتری" : n.relatedType === "SessionCard" ? "مشاهده کارت جلسه" : "مشاهده بازدیدها"}
                  </Link>
                )}
              </div>
              <div className="flex shrink-0 flex-col gap-2">
                {n.type === "FOLLOW_UP_OVERDUE" && n.relatedType === "Customer" && n.relatedId && !n.read && (
                  <Button size="sm" onClick={() => quickCalled(n)} disabled={quickSaving === n.id}>
                    {quickSaving === n.id ? "..." : "تماس گرفتم"}
                  </Button>
                )}
                {!n.read && <Button size="sm" variant="outline" onClick={() => markOne(n.id)}>خواندم</Button>}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
