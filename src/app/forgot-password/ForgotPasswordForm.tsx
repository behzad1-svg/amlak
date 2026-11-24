"use client";
import { useState } from "react";
import Link from "next/link";
import { Label, PasswordInput, PhoneInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

/** فرم بازیابی رمز با پیامک — سه مرحله: شماره، کد ۶ رقمی، رمز تازه. */
export function ForgotPasswordForm() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data: data as { error?: string; message?: string; ok?: boolean } };
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const { ok, data } = await post("/api/auth/forgot-password", { phone });
      if (!ok) { setError(data.error ?? "خطا"); return; }
      setInfo(data.message ?? "");
      setStep(2);
    } catch {
      setError("ارتباط با سرور برقرار نشد، لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { ok, data } = await post("/api/auth/forgot-password/verify", { phone, code });
      if (!ok) { setError(data.error ?? "خطا"); return; }
      setStep(3);
    } catch {
      setError("ارتباط با سرور برقرار نشد، لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) { setError("رمز تازه و تکرار آن یکی نیستند"); return; }
    setLoading(true);
    try {
      const { ok, data } = await post("/api/auth/forgot-password/reset", { phone, code, newPassword });
      if (!ok) { setError(data.error ?? "خطا"); return; }
      setDone(true);
    } catch {
      setError("ارتباط با سرور برقرار نشد، لطفاً دوباره تلاش کنید");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 space-y-4 text-center">
        <p className="rounded-[12px] border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[13px] text-emerald-700">
          رمز عبور تغییر کرد — حالا با رمز تازه وارد شوید.
        </p>
        <Link href="/login" className="inline-block text-[13px] font-bold text-[var(--sea)] hover:underline">
          بازگشت به صفحه ورود
        </Link>
      </div>
    );
  }

  return (
    <>
      {info && <div className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] px-3 py-2.5 text-[13px] text-[var(--ink-2)]">{info}</div>}
      {error && <div className="mt-4 rounded-[12px] border border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)] px-3 py-2.5 text-[13px] text-[var(--pomegranate)]">{error}</div>}

      {step === 1 && (
        <form onSubmit={requestCode} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="fp-phone">شماره تماس</Label>
            <PhoneInput id="fp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917..." dir="ltr" className="mt-1.5 text-left" autoComplete="username" inputMode="tel" required />
          </div>
          <p className="text-[12px] leading-5 text-[var(--ink-3)]">کد ۶ رقمی بازیابی به همین شماره پیامک می‌شود؛ کد ۱۰ دقیقه اعتبار دارد.</p>
          <Button type="submit" disabled={loading} className="w-full mt-2">{loading ? "در حال ارسال…" : "ارسال کد بازیابی"}</Button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={verifyCode} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="fp-code">کد ۶ رقمی</Label>
            <PhoneInput id="fp-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="۱۲۳۴۵۶" dir="ltr" className="mt-1.5 text-left tracking-[0.3em]" autoComplete="one-time-code" inputMode="numeric" required />
          </div>
          <p className="text-[12px] leading-5 text-[var(--ink-3)]">کد به شماره {phone} پیامک شد. اگر کد نیامد، به مرحلهٔ قبل برگردید و دوباره درخواست بدهید.</p>
          <Button type="submit" disabled={loading || code.length !== 6} className="w-full mt-2">{loading ? "در حال بررسی…" : "تایید کد"}</Button>
          <button type="button" className="w-full text-center text-[12px] text-[var(--ink-3)] hover:underline" onClick={() => { setStep(1); setError(""); }}>
            تغییر شماره
          </button>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={resetPassword} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="fp-new">رمز تازه</Label>
            <PasswordInput id="fp-new" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="حداقل ۱۲ کاراکتر، حرف لاتین و عدد" className="mt-1.5" autoComplete="new-password" required />
          </div>
          <div>
            <Label htmlFor="fp-confirm">تکرار رمز تازه</Label>
            <PasswordInput id="fp-confirm" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="mt-1.5" autoComplete="new-password" required />
          </div>
          <Button type="submit" disabled={loading} className="w-full mt-2">{loading ? "در حال تغییر…" : "تغییر رمز عبور"}</Button>
        </form>
      )}

      <p className="mt-6 text-center">
        <Link href="/login" className="text-[12px] text-[var(--ink-3)] hover:underline">بازگشت به صفحه ورود</Link>
      </p>
    </>
  );
}
