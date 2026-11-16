"use client";
import { useState, useEffect, createContext } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SidebarMini } from "./SidebarMini";

/** نقش کاربر — layout سرور آن را می‌دهد تا صفحات نیازی به فراخوانی /api/auth/me نداشته باشند (نقد ۸) */
export const RoleContext = createContext<string | null>(null);

export function DashboardShell({
  role,
  userName,
  unreadCount,
  unreadMatchCount,
  children,
}: {
  role?: string;
  userName?: string;
  unreadCount?: number;
  unreadMatchCount?: number;
  children: React.ReactNode;
}) {
  const [mode, setMode] = useState<"full" | "mini" | "hidden">("full");
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      const desktop = mql.matches;
      setIsDesktop(desktop);
      setMode(desktop ? "full" : "hidden");
    };
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  function toggleDesktop() {
    setMode((m) => (m === "full" ? "mini" : "full"));
  }
  function toggleMobile() {
    setMode((m) => (m === "hidden" ? "full" : "hidden"));
  }

  const showMini = isDesktop && mode === "mini";
  const showFull = mode === "full"; // eslint-disable-line @typescript-eslint/no-unused-vars -- kept for layout clarity
  const drawerOpen = mode === "full" && !isDesktop;

  // Escape منوی موبایل را می‌بندد (نقد ۱۰)
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("hidden");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <RoleContext.Provider value={role ?? null}>
    <div className="flex min-h-screen bg-[var(--paper)]">
      {/* Desktop: inline sidebar — full or mini */}
      <div className="hidden lg:flex lg:shrink-0 lg:flex-col overflow-hidden border-l border-[var(--line)] bg-white transition-all duration-200" style={{ width: isDesktop ? (mode === "mini" ? 64 : mode === "full" ? 272 : 0) : 0 }}>
        <div className="shrink-0 flex h-screen flex-col sticky top-0" style={{ width: isDesktop ? (mode === "mini" ? 64 : 272) : 272 }}>
          {showMini ? <SidebarMini role={role} userName={userName} unreadCount={unreadCount} unreadMatchCount={unreadMatchCount} onExpand={toggleDesktop} /> : <Sidebar role={role} userName={userName} unreadCount={unreadCount} unreadMatchCount={unreadMatchCount} />}
        </div>
      </div>

      {/* Mobile: overlay + drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-30 bg-[rgba(22,26,36,0.32)] backdrop-blur-[2px] lg:hidden" onClick={() => setMode("hidden")} />
      )}
      <div
        inert={!drawerOpen}
        aria-hidden={!drawerOpen}
        className={`fixed inset-y-0 right-0 z-40 flex w-[272px] flex-col bg-white border-l border-[var(--line)] shadow-xl transition-transform duration-200 lg:hidden ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <Sidebar role={role} userName={userName} unreadCount={unreadCount} unreadMatchCount={unreadMatchCount} onClose={() => setMode("hidden")} />
      </div>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        <div className="sticky top-0 z-20 flex h-[52px] items-center gap-3 border-b border-[var(--line)] bg-white/85 px-3 backdrop-blur">
          <button
            onClick={isDesktop ? toggleDesktop : toggleMobile}
            className="rounded-[12px] border border-[var(--line)] bg-white p-2 hover:bg-[var(--paper-2)] transition-colors"
            aria-label="تغییر نمایش منو"
          >
            <Menu className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-extrabold tracking-tight">املاک ساج</span>
          <span className="hidden sm:inline text-[11px] tracking-widest text-[var(--ink-3)]">بوشهر · SAJ</span>
          <span className="mr-auto hidden sm:inline text-[12px] text-[var(--ink-3)]">سامانه CRM بنگاه</span>
        </div>
        <div className="flex-1 bg-[var(--paper)]">{children}</div>
      </div>
    </div>
    </RoleContext.Provider>
  );
}
