"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function SettingsPage() {
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [newRegion, setNewRegion] = useState("");
  const [newTypeValue, setNewTypeValue] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      if (d.regions) setRegions(d.regions);
      if (d.propertyTypes) setTypes(d.propertyTypes);
    });
  }
  useEffect(() => { load(); }, []);

  async function save(nextRegions?: string[], nextTypes?: typeof types) {
    setSaving(true); setMsg("");
    const body: Record<string, unknown> = {};
    body.regions = nextRegions ?? regions;
    body.propertyTypes = nextTypes ?? types;
    const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) setMsg("ذخیره شد");
    else setMsg("خطا در ذخیره");
    setTimeout(() => setMsg(""), 2000);
  }

  return (
    <div>
      <Header title="تنظیمات" subtitle="مناطق و انواع ملک — فقط مدیر" />
      <div className="p-6 max-w-2xl space-y-6">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

        <Card>
          <h3 className="font-semibold mb-3">مناطق بوشهر</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {regions.map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                {r}
                <button onClick={() => { const next = regions.filter((x) => x !== r); setRegions(next); save(next, undefined); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newRegion} onChange={(e) => setNewRegion(e.target.value)} placeholder="نام منطقه جدید" onKeyDown={(e) => e.key === "Enter" && newRegion.trim() && (()=>{const n=[...regions, newRegion.trim()]; setRegions(n); setNewRegion(""); save(n, undefined);})()} />
            <Button onClick={() => { if (!newRegion.trim()) return; const n=[...regions, newRegion.trim()]; setRegions(n); setNewRegion(""); save(n, undefined); }} disabled={saving}>افزودن</Button>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold mb-3">انواع ملک</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {types.map((t) => (
              <span key={t.value} className="inline-flex items-center gap-1 rounded-full border bg-zinc-50 px-3 py-1 text-sm">
                {t.label} <span className="text-xs text-zinc-400">({t.value})</span>
                <button onClick={() => { const next = types.filter((x) => x.value !== t.value); setTypes(next); save(undefined, next); }} className="mr-1 text-zinc-400 hover:text-red-600">×</button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newTypeLabel} onChange={(e) => setNewTypeLabel(e.target.value)} placeholder="نام فارسی (مثلا کلنگی)" className="flex-1" />
            <Input value={newTypeValue} onChange={(e) => setNewTypeValue(e.target.value.toUpperCase().replace(/[^A-Z_]/g, ""))} placeholder="CODE (مثلا KOLANGI)" dir="ltr" className="flex-1 text-left" />
            <Button onClick={() => { if (!newTypeValue.trim() || !newTypeLabel.trim()) return; const n=[...types, { value: newTypeValue.trim(), label: newTypeLabel.trim() }]; setTypes(n); setNewTypeValue(""); setNewTypeLabel(""); save(undefined, n); }} disabled={saving}>افزودن</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
