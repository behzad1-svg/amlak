"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, Building2, Calendar, Bell, BarChart3, Settings, PanelLeftOpen, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", icon: LayoutDashboard },
  { href: "/customers", icon: Users },
  { href: "/properties", icon: Building2 },
  { href: "/deals", icon: Handshake },
  { href: "/viewings", icon: Calendar },
  { href: "/notifications", icon: Bell },
];

export function SidebarMini({ role, unreadCount, onExpand }: { role?: string; unreadCount?: number; onExpand?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex flex-1 flex-col items-center bg-white py-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--pomegranate)] text-[13px] font-extrabold text-white">س</span>
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
            </Link>
          );
        })}
        {role === "OWNER" && (
          <>
            <div className="my-1 h-px w-6 bg-[var(--line)] mx-auto" />
            <Link href="/admin" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/admin") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><BarChart3 className="h-[18px] w-[18px]" /></Link>
          </>
        )}
        <div className="my-1 h-px w-6 bg-[var(--line)] mx-auto" />
        <Link href="/settings" className={cn("flex h-9 w-9 items-center justify-center rounded-[12px] border", pathname?.startsWith("/settings") ? "bg-[var(--ink)] text-white border-[var(--ink)]" : "bg-white border-[var(--line)] text-[var(--ink-3)] hover:bg-[var(--paper-2)]")}><Settings className="h-[18px] w-[18px]" /></Link>
      </nav>
    </div>
  );
}
