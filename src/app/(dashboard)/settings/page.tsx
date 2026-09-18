"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

export default function SettingsPage() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [newRegion, setNewRegion] = useState("");
  const [newTypeValue, setNewTypeValue] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  function flash(ok: string, bad?: string) {
    setMsg(ok);
    setErr(bad ?? "");
    setTimeout(() => { setMsg(""); setErr(""); }, 2800);
  }

  function load() {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setRole(d?.user?.role ?? null));
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setTypes(d.propertyTypes);
    });
  }
  useEffect(() => { load(); }, []);

  async function save(nextRegions?: string[], nextTypes?: typeof types) {
    setSaving(true); setMsg(""); setErr("");
    const body: Record<string, unknown> = {};
    body.regions = nextRegions ?? regions;
    body.propertyTypes = nextTypes ?? types;
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) flash("ذخیره شد");
    else {
      const j = await res.json().catch(() => ({}));
      flash("", j.error || "خطا در ذخیره");
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.newPassword !== pw.confirm) {
      flash("", "تکرار رمز جدید یکسان نیست");
      return;
    }
    setPwSaving(true);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }),
    });
    const j = await res.json().catch(() => ({}));
    setPwSaving(false);
    if (!res.ok) {
      flash("", j.error || "خطا در تغییر رمز");
      return;
    }
    setPw({ currentPassword: "", newPassword: "", confirm: "" });
    flash("رمز تغییر کرد — دوباره وارد شوید");
    setTimeout(() => router.push("/login"), 1200);
  }

  return (
    <div>
      <Header
        title="تنظیمات"
        subtitle={role === "OWNER" ? "مناطق، انواع ملک و امنیت حساب" : "امنیت حساب"}
      />
      <div className="p-6 max-w-2xl space-y-6">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <Card>
          <h3 className="font-semibold mb-3">تغییر رمز عبور</h3>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <Label>رمز فعلی</Label>
              <Input type="password" className="mt-1" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required />
            </div>
            <div>
              <Label>رمز جدید (حداقل ۸ کاراکتر)</Label>
              <Input type="password" className="mt-1" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={8} />
            </div>
            <div>
              <Label>تکرار رمز جدید</Label>
              <Input type="password" className="mt-1" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required minLength={8} />
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
              <div className="flex gap-2">
                <Input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="نام منطقه جدید" />
                <Button onClick={() => { if (!newRegion.trim()) return; const n = [...regions, newRegion.trim()]; setRegions(n); setNewRegion(""); save(n, undefined); }} disabled={saving}>افزودن</Button>
              </div>
            </Card>

            <Card>
              <h3 className="font-semibold mb-3">انواع ملک</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {types.map((t) => (
                  <span key={t.value} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                    {t.label} <span className="text-xs text-zinc-400">({t.value})</span>
                    <button type="button" onClick={() => { const next = types.filter((x) => x.value !== t.value); setTypes(next); save(undefined, next); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <Input value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="نام فارسی (مثلا کلنگی)" className="flex-1" />
                <Input value={newTypeValue} onChange={(e) => setNewTypeValue(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ""))} placeholder="CODE (مثلا KOLANGI)" dir="ltr" className="flex-1 text-left" />
                <Button onClick={() => { if (!newTypeValue.trim() || !newTypeLabel.trim()) return; const n = [...types, { value: newTypeValue.trim(), label: newTypeLabel.trim() }]; setTypes(n); setNewTypeValue(""); setNewTypeLabel(""); save(undefined, n); }} disabled={saving}>افزودن</Button>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
