// نقد ۱ و ۸ — تنظیمات با کمک‌کنندهٔ مرکزی؛ نقش از کانتکست می‌آید
// (دیگر فراخوانی /api/auth/me نیست) و پیام خطا تا اقدام بعدی می‌ماند.
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label, NumberInput, PasswordInput } from "@/components/ui/Input";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { toFaDigits } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const { role } = useRole();
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [taxRate, setTaxRate] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newRegion, setNewRegion] = useState("");
  const [newTypeValue, setNewTypeValue] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [renameFor, setRenameFor] = useState<{ value: string; label: string } | null>(null);
  const [renameCode, setRenameCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  // پیام موفقیت خودبه‌خود پاک می‌شود؛ پیام خطا تا اقدام بعدی می‌ماند
  function flash(ok: string, bad?: string) {
    setMsg(ok);
    setErr(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 2800);
  }

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const d = await apiJson<{ regions?: string[]; propertyTypes?: { value: string; label: string }[]; customerTags?: string[]; taxRate?: number }>("/api/settings");
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setTypes(d.propertyTypes);
      if (d.customerTags) setTags(d.customerTags);
      if (d.taxRate != null) setTaxRate(String(d.taxRate));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    // بارگذاری اولیهٔ داده — الگوی استاندارد صفحه‌های کلاینتی
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function save(nextRegions?: string[], nextTypes?: typeof types, nextTags?: string[], nextTaxRate?: string): Promise<boolean> {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regions: nextRegions ?? regions, propertyTypes: nextTypes ?? types, customerTags: nextTags ?? tags, ...(Number.isFinite(Number(nextTaxRate ?? taxRate)) && Number(nextTaxRate ?? taxRate) >= 0 && Number(nextTaxRate ?? taxRate) <= 100 ? { taxRate: Number(nextTaxRate ?? taxRate) } : {}) }),
      });
      flash("ذخیره شد");
      return true;
    } catch (e) {
      flash("", errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  // تغییر کد نوع ملک — همهٔ فایل‌ها و ترجیح مشتریان با کد قدیمی تراکنشی آپدیت می‌شوند
  async function renameType(t: { value: string; label: string }, input: string): Promise<boolean> {
    const code = input.trim().toUpperCase();
    if (!code || code === t.value) return true;
    if (!/^[A-Z_]+$/.test(code)) {
      flash("", "کد جدید فقط حروف بزرگ انگلیسی و _ می‌تواند باشد");
      return false;
    }
    setSaving(true);
    try {
      const d = await apiJson<{ ok: boolean; renamed?: { from: string; to: string; properties: number; customers: number } }>("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renamePropertyType: { from: t.value, to: code } }),
      });
      setTypes(types.map((x) => (x.value === t.value ? { ...x, value: code } : x)));
      const n = d.renamed;
      flash(`کد نوع به «${code}» تغییر کرد${n ? ` — ${toFaDigits(String(n.properties))} فایل و ${toFaDigits(String(n.customers))} ترجیح مشتری به‌روز شد` : ""}`);
      return true;
    } catch (e) {
      flash("", errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) {
      flash("", "تکرار رمز جدید یکسان نیست");
      return;
    }
    setPwSaving(true);
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
      });
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      flash("رمز تغییر کرد — دوباره وارد شوید");
      setTimeout(() => router.push("/login"), 1200);
    } catch (err2) {
      flash("", errorMessage(err2));
    } finally {
      setPwSaving(false);
    }
  }

  if (loading) return <PageSkeleton rows={3} />;
  if (loadError) return <PageError message={loadError} onRetry={load} />;

  return (
    <div>
      <Header
        title="تنظیمات"
        subtitle={role === "OWNER" ? "مناطق، انواع ملک، برچسب‌های مشتری، مالیات ارزش افزوده و امنیت حساب" : "امنیت حساب"}
      />
      <div className="p-4 sm:p-6 max-w-2xl space-y-6">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{err}</div>}

        <Card>
          <h3 className="font-semibold mb-3">تغییر رمز عبور</h3>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <Label htmlFor="f-currentPassword">رمز فعلی</Label>
              <PasswordInput id="f-currentPassword" className="mt-1" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="f-newPassword">رمز جدید (حداقل ۱۲ کاراکتر، شامل حرف و رقم)</Label>
              <PasswordInput id="f-newPassword" className="mt-1" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={12} />
            </div>
            <div>
              <Label htmlFor="f-confirm">تکرار رمز جدید</Label>
              <PasswordInput id="f-confirm" className="mt-1" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={12} />
            </div>
            <Button type="submit" disabled={pwSaving}>{pwSaving ? "..." : "تغییر رمز"}</Button>
          </form>
        </Card>

        {role === "OWNER" && (
          <>
            <Card>
              <h3 className="font-semibold mb-3">مناطق بوشهر</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {regions.map((r) => (
                  <span key={r} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                    {r}
                    <button type="button" onClick={() => { const next = regions.filter((x) => x !== r); setRegions(next); save(next, undefined); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="نام منطقه جدید" />
                <Button onClick={() => { if (!newRegion.trim()) return; const n = [...regions, newRegion.trim()]; setRegions(n); setNewRegion(""); save(n, undefined); }} disabled={saving} className="w-full sm:w-auto">افزودن</Button>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">انواع ملک</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {types.map((t) => (
                  <span key={t.value} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                    {t.label} <span className="text-xs text-zinc-400">({t.value})</span>
                    <button type="button" title="تغییر کد نوع" onClick={() => { setRenameFor(t); setRenameCode(t.value); }} className="mr-1 text-zinc-400 hover:text-[var(--sea)]">✎</button>
                    <button type="button" onClick={() => { void (async () => { const next = types.filter((x) => x.value !== t.value); if (await save(undefined, next)) setTypes(next); })(); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
              {renameFor && (
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Label htmlFor="f-renameType">کد جدید برای «{renameFor.label}» (فقط حروف بزرگ انگلیسی و _)</Label>
                    <Input
                      id="f-renameType"
                      dir="ltr"
                      className="mt-1 text-left"
                      value={renameCode}
                      onChange={(e) => setRenameCode(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ""))}
                      placeholder="CODE"
                    />
                  </div>
                  <Button
                    onClick={async () => { if (await renameType(renameFor, renameCode)) setRenameFor(null); }}
                    disabled={saving}
                    className="w-full sm:w-auto"
                  >
                    ذخیره کد
                  </Button>
                  <Button variant="ghost" onClick={() => setRenameFor(null)} className="w-full sm:w-auto">
                    انصراف
                  </Button>
                </div>
              )}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="نام فارسی (مثلا کلنگی)" className="flex-1" />
                <Input value={newTypeValue} onChange={(e) => setNewTypeValue(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ""))} placeholder="CODE (مثلا KOLANGI)" dir="ltr" className="flex-1 text-left" />
                <Button onClick={() => { if (!newTypeValue.trim() || !newTypeLabel.trim()) return; const n = [...types, { value: newTypeValue.trim(), label: newTypeLabel.trim() }]; setTypes(n); setNewTypeValue(""); setNewTypeLabel(""); save(undefined, n); }} disabled={saving} className="w-full sm:w-auto">افزودن</Button>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">مالیات ارزش افزوده</h3>
              <p className="text-[12px] text-[var(--ink-3)] mb-3">نرخ مالیات فقط روی کمیسیون حساب می‌شود؛ شیرینی مالیات ندارد. مالیات جزو تقسیم درآمد نیست و به مشاور پرداخت نمی‌شود.</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                  <Label htmlFor="f-taxRate">مالیات ارزش افزوده (٪)</Label>
                  <NumberInput id="f-taxRate" className="mt-1" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="۱۰" allowDecimal />
                </div>
                <Button onClick={() => { const n = Number(taxRate); if (!Number.isFinite(n) || n < 0 || n > 100) { flash("", "نرخ مالیات باید عددی بین ۰ تا ۱۰۰ باشد"); return; } save(undefined, undefined, undefined, String(n)); }} disabled={saving} className="w-full sm:w-auto self-end">ذخیره</Button>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">برچسب‌های مشتری</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                    {t}
                    <button type="button" onClick={() => { const next = tags.filter((x) => x !== t); setTags(next); save(undefined, undefined, next); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
                  </span>
                ))}
                {tags.length === 0 && <span className="text-sm text-zinc-400">برچسبی تعریف نشده</span>}
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="برچسب جدید (مثلا نقدی)" />
                <Button onClick={() => { const v = newTag.trim(); if (!v || tags.includes(v)) return; const n = [...tags, v]; setTags(n); setNewTag(""); save(undefined, undefined, n); }} disabled={saving} className="w-full sm:w-auto">افزودن</Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
