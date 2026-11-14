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
import { formatDate } from "@/lib/utils";

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

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await apiJson<{ notifications?: NotificationRow[] }>("/api/notifications");
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
        body: JSON.stringify({ markAllRead: true }),
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

  if (loading) return <PageSkeleton rows={4} />;
  if (loadError) return <PageError message={loadError} onRetry={load} />;

  return (
    <div>
      <Header title="اعلان‌ها" action={<Button variant="outline" onClick={markAll}>همه خوانده شد</Button>} />
      <div className="p-4 sm:p-6 space-y-3 max-w-3xl">
        {actionError && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{actionError}</div>
        )}
        {list.length === 0 ? <p className="text-zinc-400">اعلانی ندارید</p> : list.map((n) => (
          <Card key={n.id} className={n.read ? "opacity-60" : "border-amber-200 bg-amber-50/30"}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-1"><Badge className={n.priority === "HIGH" ? "bg-red-100 text-red-700 border-red-200" : ""}>{n.priority}</Badge><Badge>{n.type}</Badge></div>
                <p className="text-sm break-words">{n.message}</p>
                <p className="text-xs text-zinc-400 mt-1">{formatDate(n.createdAt)}</p>
                {n.type === "MATCH_SUGGESTION" && n.relatedId && n.relatedType && (
                  <Link
                    href={n.relatedType === "Property" ? `/properties/${n.relatedId}` : `/customers/${n.relatedId}`}
                    className="mt-2 inline-block rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                  >
                    {n.relatedType === "Property" ? "مشاهده فایل" : "مشاهده مشتری"}
                  </Link>
                )}
              </div>
              {!n.read && <Button size="sm" variant="outline" onClick={() => markOne(n.id)}>خواندم</Button>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
