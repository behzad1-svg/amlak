"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Label, PasswordInput, PhoneInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { recordActivity } from "@/lib/idleTimeout";

/** فرم ورود — تنها بخش تعاملی صفحه ورود؛ بقیه صفحه سرورکامپوننت است */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // بازگشت به صفحه درخواستی پس از ورود — فقط مسیر داخلی معتبر پذیرفته می شود
  const nextParam = searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.includes("\\") ? nextParam : "/dashboard";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, password }) });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "خطا"); return; }
      // ورود تازه: «الان» را به‌عنوان آخرین فعالیت ثبت کن تا بررسی کهنگی
      // هنگام بازشدن داشبورد (IdleLogout)، نشست تازه را بیرون نیندازد.
      // بدون این ثبت، مقدار کهنهٔ قبلی در localStorage می‌ماند و کاربر
      // لحظه‌ای پس از ورود، بیرون انداخته می‌شود.
      recordActivity();
      router.push(next);
    } catch {
      setError("ارتباط با سرور برقرار نشد، لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && <div className="mt-4 rounded-[12px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-3 py-2.5 text-[13px] text-[var(--pomegranate)]">{error}</div>}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="f-phone">شماره تماس</Label>
          <PhoneInput id="f-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917..." dir="ltr" className="mt-1.5 text-left" autoComplete="username" inputMode="tel" required />
        </div>
        <div>
          <Label htmlFor="f-password">رمز عبور</Label>
          <PasswordInput id="f-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" autoComplete="current-password" required />
        </div>
        <Button type="submit" disabled={loading} className="w-full mt-2">{loading ? "در حال ورود..." : "ورود"}</Button>
      </form>
      <p className="mt-4 text-center">
        <a href="/forgot-password" className="text-[12px] text-[var(--sea)] hover:underline">فراموشی رمز</a>
      </p>
    </>
  );
}
