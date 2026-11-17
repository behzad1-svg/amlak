"use client";
import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY, resolveTheme, type Theme } from "@/lib/theme";

/** دکمه تغییر تم روشن/تاریک — انتخاب در localStorage می ماند و روی <html data-theme> اعمال می شود */
export function ThemeToggle({ className }: { className?: string }) {
  // مقدار اولیه را از همان چیزی می خوانیم که اسکریپت ابتدای صفحه گذاشته تا آیکون چشمک نزند
  const [theme, setTheme] = useState<Theme>(() =>
    typeof document === "undefined"
      ? "light"
      : resolveTheme(document.documentElement.getAttribute("data-theme")),
  );

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // حافظه در دسترس نیست؛ تم فقط برای همین نشست اعمال می شود
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "تم روشن" : "تم تاریک"}
      title={theme === "dark" ? "تم روشن" : "تم تاریک"}
      className={
        className ??
        "rounded-[12px] border border-[var(--line)] bg-white p-2 text-[var(--ink-2)] transition-colors hover:bg-[var(--paper-2)]"
      }
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
