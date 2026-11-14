"use client";
import { useContext, useEffect, useState } from "react";
import { RoleContext } from "@/components/layout/DashboardShell";

/** نقش کاربر واردشده — برای نمایش/پنهان‌کردن دکمه‌های مدیریتی.
 *  نقش را اول از کانتکست می‌خواند (layout سرور آن را از پروکسی گرفته است)؛
 *  فقط وقتی بیرون از DashboardShell استفاده شود، به /api/auth/me برمی‌گردد.
 *  این کار هم رفت‌وبرگشت اضافه را حذف می‌کند و هم پرش نقش (role flash) را. */
export function useRole(): { role: string | null; isOwner: boolean; loading: boolean } {
  const ctxRole = useContext(RoleContext);
  const [fetchedRole, setFetchedRole] = useState<string | null>(null);
  const [fetchedLoading, setFetchedLoading] = useState(true);

  useEffect(() => {
    if (ctxRole != null) return; // نقش از کانتکست می‌آید؛ فراخوانی لازم نیست
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setFetchedRole(d?.user?.role ?? null);
        setFetchedLoading(false);
      })
      .catch(() => {
        if (alive) setFetchedLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ctxRole]);

  const role = ctxRole ?? fetchedRole;
  const loading = ctxRole == null && fetchedLoading;
  return { role, isOwner: role === "OWNER", loading };
}
