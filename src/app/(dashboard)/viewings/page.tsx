"use client";
import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { formatDate } from "@/lib/utils";

export default function ViewingsPage() {
  const [list, setList] = useState<{ id: string; startAt: string; status: string; customer: { name: string }; property: { title: string } }[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([]);
  const [properties, setProperties] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState({ customerId: "", propertyId: "", startAt: "" });
  const upd = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  function load() { fetch("/api/viewings").then((r) => r.json()).then((d) => setList(Array.isArray(d) ? d : [])); }
  useEffect(() => { load(); fetch("/api/customers").then((r) => r.json()).then((d) => setCustomers(Array.isArray(d) ? d : [])); fetch("/api/properties").then((r) => r.json()).then((d) => setProperties(Array.isArray(d) ? d : [])); }, []);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/viewings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setForm({ customerId: "", propertyId: "", startAt: "" }); load();
  }
  return (
    <div>
      <Header title="بازدیدها" />
      <div className="p-6 max-w-3xl space-y-6">
        <Card>
          <h3 className="font-semibold mb-3">ثبت بازدید جدید</h3>
          <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
            <div><Label>مشتری</Label><Select value={form.customerId} onChange={(e) => upd("customerId", e.target.value)} required className="mt-1"><option value="">انتخاب</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></div>
            <div><Label>فایل</Label><Select value={form.propertyId} onChange={(e) => upd("propertyId", e.target.value)} required className="mt-1"><option value="">انتخاب</option>{properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select></div>
            <div><Label>زمان</Label><Input type="datetime-local" value={form.startAt} onChange={(e) => upd("startAt", e.target.value)} required className="mt-1" /></div>
            <Button type="submit" className="md:col-span-3">ثبت</Button>
          </form>
        </Card>
        <div className="space-y-2">
          {list.map((v) => <Card key={v.id} className="flex justify-between items-center"><span>{v.customer?.name} — {v.property?.title}</span><span className="flex items-center gap-2"><Badge>{v.status}</Badge><span className="text-sm text-zinc-500">{formatDate(v.startAt)}</span></span></Card>)}
          {list.length === 0 && <p className="text-sm text-zinc-400">بازدیدی ثبت نشده</p>}
        </div>
      </div>
    </div>
  );
}
