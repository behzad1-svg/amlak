import { ThemeToggle } from "@/components/ThemeToggle";
import Image from "next/image";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

/**
 * صفحه بازیابی رمز با پیامک — عمومی است (مثل /login) و سه مرحله دارد:
 * شماره تماس، کد ۶ رقمی پیامک‌شده، رمز تازه.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="relative min-h-screen bg-[var(--paper)] flex">
      <div className="absolute left-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <Image src="/saj-logo.png" alt="املاک ساج — مشاور املاک" width={440} height={195} sizes="220px" className="saj-logo h-auto w-[220px]" priority />
            <div className="mt-2 text-[11px] text-[var(--ink-3)]">بوشهر · SAJ REAL ESTATE</div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-6 sm:p-7 shadow-[0_8px_24px_rgba(22,26,36,0.06)]">
            <h1 className="text-[18px] font-extrabold tracking-tight">بازیابی رمز عبور</h1>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--ink-3)]">کد بازیابی به شماره تماس شما پیامک می‌شود.</p>

            <ForgotPasswordForm />

            <p className="mt-6 text-center text-[11px] text-[var(--ink-3)]">بوشهر — سامانه CRM املاک ساج</p>
          </div>
        </div>
      </div>
    </main>
  );
}
