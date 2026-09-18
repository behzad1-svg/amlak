"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Building2, Calendar, Bell, CheckSquare, LogOut, BarChart3, Settings, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/customers", label: "مشتریان", icon: Users },
  { href: "/properties", label: "فایل‌ها", icon: Building2 },
  { href: "/deals", label: "معاملات", icon: Handshake },
  { href: "/viewings", label: "بازدیدها", icon: Calendar },
  { href: "/tasks", label: "وظایف", icon: CheckSquare },
  { href: "/notifications", label: "اعلان‌ها", icon: Bell },
];

export function Sidebar({ role, unreadCount, onClose }: { role?: string; unreadCount?: number; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }
  return (
    <div className="flex flex-1 flex-col bg-white">
      <div className="flex h-[64px] items-center justify-between border-b border-[var(--line)] px-5 shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--pomegranate)] text-[13px] font-extrabold text-white shadow-sm">س</span>
          <div className="leading-none">
            <div className="text-[14px] font-extrabold tracking-tight text-[var(--ink)]">املاک ساج</div>
            <div className="mt-0.5 text-[11px] font-medium tracking-widest text-[var(--ink-3)]">بوشهر · SAJ</div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-[10px] p-1.5 text-xl leading-none text-[var(--ink-3)] hover:bg-[var(--paper-2)] lg:hidden" aria-label="بستن">×</button>
        )}
      </div>

      <div className="px-3 pt-3">
        <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2.5">
          <div className="text-[11px] font-medium tracking-widest text-[var(--ink-3)]">سامانه مدیریت</div>
          <div className="mt-1 text-[12px] leading-5 text-[var(--ink-2)]">پیگیری اجباری · تطبیق هوشمند</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
        {nav.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-[var(--ink)] text-white"
                  : "text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-white" : "text-[var(--ink-3)]")} />
              {item.label}
              {item.href === "/notifications" && unreadCount ? (
                <span className={cn("mr-auto rounded-full px-2 py-0.5 text-[11px] font-bold", active ? "bg-white text-[var(--ink)]" : "bg-[var(--pomegranate)] text-white")}>{unreadCount}</span>
              ) : null}
            </Link>
          );
        })}
        {role === "OWNER" && (
          <>
            <div className="pt-2">
              <div className="px-3 pb-1 text-[11px] font-medium tracking-widest text-[var(--ink-3)]">مدیریت</div>
            </div>
            <Link
              href="/admin"
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium",
                pathname?.startsWith("/admin") ? "bg-[var(--ink)] text-white" : "text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
              )}
            >
              <BarChart3 className={cn("h-[18px] w-[18px]", pathname?.startsWith("/admin") ? "text-white" : "text-[var(--ink-3)]")} /> مدیریت
            </Link>
          </>
        )}
        <Link
          href="/settings"
          onClick={onClose}
          className={cn(
            "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium",
            pathname?.startsWith("/settings") ? "bg-[var(--ink)] text-white" : "text-[var(--ink-2)] hover:bg-[var(--paper-2)]"
          )}
        >
          <Settings className={cn("h-[18px] w-[18px]", pathname?.startsWith("/settings") ? "text-white" : "text-[var(--ink-3)]")} /> تنظیمات
        </Link>
      </nav>

      <div className="border-t border-[var(--line)] p-3 shrink-0">
        <button onClick={logout} className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13.5px] font-medium text-[var(--ink-2)] hover:bg-[var(--paper-2)]">
          <LogOut className="h-[18px] w-[18px] text-[var(--ink-3)]" /> خروج
        </button>
      </div>
    </div>
  );
}
