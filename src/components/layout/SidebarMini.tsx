"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, BookUser, Building2, Bell, GitMerge, CalendarClock, BarChart3, Settings, PanelLeftOpen, UserCog, TrendingUp, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

const nav = [
  { href: "/dashboard", icon: LayoutDashboard },
  { href: "/customers", icon: Users },
  { href: "/properties", icon: Building2 },
  { href: "/notifications", icon: Bell },
  { href: "/matching", icon: GitMerge },
  { href: "/session-cards", icon: CalendarClock },
  { href: "/accounting", icon: Wallet },
  { href: "/phonebook", icon: BookUser },
];

export function SidebarMini({ role, userName, unreadCount, unreadMatchCount, pendingSessionCardCount, onExpand }: { role?: string; userName?: string; unreadCount?: number; unreadMatchCount?: number; pendingSessionCardCount?: number; onExpand?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-1 flex-col items-center bg-white py-3">
      <Image src="/saj-logo-mark.png" alt="املاک ساج" width={1331} height={464} className="saj-logo h-9 w-auto" />
      <button onClick={onExpand} className="mt-3 rounded-[10px] border border-[var(--line)] bg-white p-1.5 hover:bg-[var(--paper-2)]" aria-label="باز کردن منو">
        <PanelLeftOpen className="h-4 w-4" />
      </button>
      <nav className="mt-4 flex flex-1 flex-col gap-1">
        {nav.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={cn("relative flex h-9 w-9 items-center justify-center rounded-[12px] border", active ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}>
              <item.icon className="h-[18px] w-[18px]" />
              {item.href === "/notifications" && unreadCount ? <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pomegranate)] px-1 text-[10px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
              {item.href === "/matching" && unreadMatchCount ? <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pomegranate)] px-1 text-[10px] font-bold text-white">{unreadMatchCount > 9 ? "9+" : unreadMatchCount}</span> : null}
              {item.href === "/session-cards" && pendingSessionCardCount ? <span className="absolute -top-1 -left-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pomegranate)] px-1 text-[10px] font-bold text-white">{pendingSessionCardCount > 9 ? "9+" : pendingSessionCardCount}</span> : null}
            </Link>
          );
        })}
        {role === "OWNER" && (
          <>
            <div className="my-1 h-px w-6 bg-[var(--line)] mx-auto" />
            <Link href="/admin" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/admin") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><BarChart3 className="h-[18px] w-[18px]" /></Link>
            <Link href="/users" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/users") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><UserCog className="h-[18px] w-[18px]" /></Link>
          </>
        )}
            <Link href="/reports" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/reports") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><TrendingUp className="h-[18px] w-[18px]" /></Link>
        <div className="my-1 h-px w-6 bg-[var(--line)] mx-auto" />
        <Link href="/settings" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/settings") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><Settings className="h-[18px] w-[18px]" /></Link>
      </nav>
      {userName && (
        <span title={userName} className="mt-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ink)] text-[13px] font-bold text-white">{userName.trim().charAt(0)}</span>
      )}
    </div>
  );
}
