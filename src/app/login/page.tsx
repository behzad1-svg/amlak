import { Suspense } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

/**
 * صفحه ورود — سرورکامپوننت؛ فقط فرم ورود کلاینت است (LoginForm).
 * پیش از این کل صفحه "use client" بود و پنل تبلیغاتی و لوگو هم جاوااسکریپت
 * کلاینت می‌خواستند. حالا فقط فرم هایدریت می‌شود.
 * لوگو با sizes="220px" سرو می‌شود (پیش از این w=3840 می‌آمد در حالی که
 * نمایش ۲۲۰ پیکسل است) و محتوا در <main> است (لندمارک دسترسی‌پذیری).
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="relative min-h-screen bg-[var(--paper)] flex items-center justify-center">
          <p className="text-[14px] text-[var(--ink-3)]">در حال بارگذاری…</p>
        </main>
      }
    >
      <main className="relative min-h-screen bg-[var(--paper)] flex">
        <div className="absolute left-4 top-4 z-10">
          <ThemeToggle />
        </div>
        {/* Right — form */}
        <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
          <div className="w-full max-w-[420px]">
            <div className="mb-8">
              <Image src="/saj-logo.png" alt="املاک ساج — مشاور املاک" width={440} height={195} sizes="220px" className="saj-logo h-auto w-[220px]" priority />
              <div className="mt-2 text-[11px] text-[var(--ink-3)]">بوشهر · SAJ REAL ESTATE</div>
            </div>

            <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-6 sm:p-7 shadow-[0_8px_24px_rgba(22,26,36,0.06)]">
              <h1 className="text-[18px] font-extrabold tracking-tight">ورود به سامانه CRM</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-[var(--ink-3)]">سامانه CRM املاک ساج بوشهر</p>

              <LoginForm />

              <p className="mt-6 text-center text-[11px] text-[var(--ink-3)]">بوشهر — سامانه CRM املاک ساج</p>
            </div>

            <p className="mt-6 text-center text-[12px] leading-5 text-[var(--ink-3)]">پیگیری منظم · تطبیق هوشمند · دسترسی کنترل‌شده</p>
          </div>
        </div>

        {/* Left — editorial panel */}
        <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden border-r border-[var(--line)] bg-[var(--ink)] text-white">
          <div className="login-dot-pattern absolute inset-0 opacity-[0.08]" />
          <div className="absolute -top-24 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--pomegranate)] opacity-20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-[380px] w-[380px] rounded-full bg-[var(--sea)] opacity-20 blur-3xl" />
          <div className="relative flex flex-1 flex-col p-10">
            <div className="mt-auto">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px]">سامانه CRM · املاک ساج بوشهر</div>
              <h2 className="mt-6 text-[34px] font-extrabold leading-[1.1] tracking-tight">
                هر پیگیری،
                <br />
                یک فرصتِ فروش.
              </h2>
              <p className="mt-4 max-w-[44ch] text-[14px] leading-7 text-white/70">
                ساج پیگیری و تطبیق فایل و مشتری را خودکار انجام می‌دهد — تا هیچ فرصتی از دست نرود.
              </p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] text-white/60">پیگیری</div>
                  <div className="mt-1 text-[13px] font-bold">عقب‌افتاده = قرمز</div>
                </div>
                <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] text-white/60">تطبیق</div>
                  <div className="mt-1 text-[13px] font-bold">دو طرفه · ≥۷۰٪</div>
                </div>
                <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                  <div className="text-[11px] text-white/60">دسترسی</div>
                  <div className="mt-1 text-[13px] font-bold">موقت · کنترل‌شده</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </Suspense>
  );
}
