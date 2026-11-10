"use client";
import { useEffect, useState } from "react";

/** نقش کاربر واردشده — برای نمایش/پنهان‌کردن دکمه‌های مدیریتی */
export function useRole(): { role: string | null; isOwner: boolean; loading: boolean } {
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setRole(d?.user?.role ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);
  return { role, isOwner: role === "OWNER", loading };
}
