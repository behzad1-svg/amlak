"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function LoginPage() {
  const router = useRouter();
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
      router.push("/dashboard");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex">
      {/* Right — form */}
      <div className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[var(--pomegranate)] text-sm font-extrabold text-white">س</span>
            <div>
              <div className="text-[15px] font-extrabold tracking-tight">املاک ساج</div>
              <div className="text-[11px] tracking-widest text-[var(--ink-3)]">بوشهر · SAJ REAL ESTATE</div>
            </div>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-[var(--line)] bg-white p-6 sm:p-7 shadow-[0_8px_24px_rgba(22,26,36,0.06)]">
            <h1 className="text-[18px] font-extrabold tracking-tight">ورود به سامانه CRM</h1>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--ink-3)]">سامانه CRM املاک ساج بوشهر</p>

            {error && <div className="mt-4 rounded-[12px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-3 py-2.5 text-[13px] text-[var(--pomegranate)]">{error}</div>}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <Label>شماره تماس</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917..." dir="ltr" className="mt-1.5 text-left" />
              </div>
              <div>
                <Label>رمز عبور</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" dir="ltr" className="mt-1.5 text-left" />
              </div>
              <Button type="submit" disabled={loading} className="w-full mt-2">{loading ? "در حال ورود..." : "ورود"}</Button>
            </form>

            <p className="mt-6 text-center text-[11px] tracking-widest text-[var(--ink-3)]">بوشهر — سامانه CRM املاک ساج</p>
          </div>

          <p className="mt-6 text-center text-[12px] leading-5 text-[var(--ink-3)]">پیگیری اجباری · تطبیق هوشمند · دسترسی کنترل‌شده</p>
        </div>
      </div>

      {/* Left — editorial panel */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden border-r border-[var(--line)] bg-[var(--ink)] text-white">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle at 30% 20%, white 1px, transparent 1px)", backgroundSize: "18px 18px" }} />
        <div className="absolute -top-24 -left-24 h-[380px] w-[380px] rounded-full bg-[var(--pomegranate)] opacity-20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-[380px] w-[380px] rounded-full bg-[var(--sea)] opacity-20 blur-3xl" />
        <div className="relative flex flex-1 flex-col p-10">
          <div className="mt-auto">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] tracking-widest">سامانه CRM · املاک ساج بوشهر</div>
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
                <div className="text-[11px] tracking-widest text-white/60">پیگیری</div>
                <div className="mt-1 text-[13px] font-bold">عقب‌افتاده = قرمز</div>
              </div>
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] tracking-widest text-white/60">تطبیق</div>
                <div className="mt-1 text-[13px] font-bold">دو طرفه · ≥۷۰٪</div>
              </div>
              <div className="rounded-[14px] border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] tracking-widest text-white/60">دسترسی</div>
                <div className="mt-1 text-[13px] font-bold">موقت · کنترل‌شده</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
