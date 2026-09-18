"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, Select } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { DEAL_STATUS_COLORS, DEAL_STATUS_LABELS } from "@/lib/dealConstants";
import { DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";

type Deal = {
  id: string;
  status: string;
  contractAt: string | null;
  notes: string | null;
  customer: { id: string; name: string; phone?: string };
  property: { id: string; title: string; dealType: string; region?: string };
  agent: { id: string; name: string };
};

type Option = { id: string; label: string };

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [properties, setProperties] = useState<Option[]>([]);
  const [filter, setFilter] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    customerId: "",
    propertyId: "",
    status: "PENDING",
    notes: "",
  });

  const flash = (ok: string, bad?: string) => {
    setMsg(ok);
    setErr(bad ?? "");
    setTimeout(() => { setMsg(""); setErr(""); }, 3000);
  };

  const load = useCallback(async () => {
    const q = filter ? `?status=${filter}` : "";
    const [dealsRes, custRes, propRes] = await Promise.all([
      fetch(`/api/deals${q}`).then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
      fetch("/api/properties").then((r) => r.json()),
    ]);
    setDeals(Array.isArray(dealsRes) ? dealsRes : []);
    const custs = Array.isArray(custRes) ? custRes : [];
    const props = Array.isArray(propRes) ? propRes : [];
    setCustomers(custs.map((c: { id: string; name: string; phone?: string }) => ({ id: c.id, label: `${c.name}${c.phone ? ` — ${c.phone}` : ""}` })));
    setProperties(props.map((p: { id: string; title: string; region?: string }) => ({ id: p.id, label: `${p.title}${p.region ? ` — ${p.region}` : ""}` })));
  }, [filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId || !form.propertyId) {
      flash("", "مشتری و فایل الزامی است");
      return;
    }
    setSaving(true);
    const body = {
      customerId: form.customerId,
      propertyId: form.propertyId,
      status: form.status,
      notes: form.notes || null,
    };
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return flash("", j.error || "خطا در ثبت معامله");
    setShowForm(false);
    setForm({ customerId: "", propertyId: "", status: "PENDING", notes: "" });
    flash("معامله ثبت شد");
    load();
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return flash("", j.error || "خطا");
    flash(status === "CANCELED" ? "معامله لغو شد" : status === "COMPLETED" ? "معامله قطعی شد" : "به‌روزرسانی شد");
    load();
  }

  return (
    <div>
      <Header
        title="معاملات"
        subtitle={`${deals.length} معامله — در جریان، قطعی و لغوشده`}
        action={
          <div className="flex items-center gap-2">
            <Select value={filter} onChange={(e) => setFilter(e.target.value)} className="w-[140px]">
              <option value="">همه</option>
              <option value="PENDING">در جریان</option>
              <option value="COMPLETED">قطعی</option>
              <option value="CANCELED">لغوشده</option>
            </Select>
            <Button onClick={() => setShowForm((v) => !v)}>＋ معامله جدید</Button>
          </div>
        }
      />
      <div className="p-6 space-y-4 max-w-[1120px]">
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        {showForm && (
          <Card>
            <h3 className="font-semibold mb-3">ثبت معامله</h3>
            <form onSubmit={createDeal} className="grid gap-3 sm:grid-cols-2">
              <div>
                <SearchSelect
                  label="مشتری"
                  required
                  value={form.customerId}
                  onChange={(id) => setForm({ ...form, customerId: id })}
                  options={customers}
                  placeholder="جستجوی مشتری..."
                />
              </div>
              <div>
                <SearchSelect
                  label="فایل"
                  required
                  value={form.propertyId}
                  onChange={(id) => setForm({ ...form, propertyId: id })}
                  options={properties}
                  placeholder="جستجوی فایل (کد/عنوان)..."
                />
              </div>
              <div>
                <Label>وضعیت</Label>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="PENDING">در جریان</option>
                  <option value="COMPLETED">قطعی</option>
                </Select>
              </div>
              <div>
                <Label>یادداشت</Label>
                <Input className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={saving}>{saving ? "..." : "ثبت معامله"}</Button>
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>انصراف</Button>
              </div>
            </form>
          </Card>
        )}

        {deals.length === 0 ? (
          <div className="rounded-[16px] border border-dashed border-[var(--line-2)] bg-white px-6 py-10 text-center text-[13px] text-[var(--ink-3)]">
            هنوز معامله‌ای ثبت نشده است.
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={DEAL_STATUS_COLORS[d.status] ?? ""}>{DEAL_STATUS_LABELS[d.status] ?? d.status}</Badge>
                      <Link href={`/customers/${d.customer.id}`} className="text-[14px] font-extrabold hover:underline">{d.customer.name}</Link>
                      <span className="text-[var(--ink-3)]">←</span>
                      <Link href={`/properties/${d.property.id}`} className="text-[14px] font-bold text-[var(--ink-2)] hover:underline">{d.property.title}</Link>
                    </div>
                    <div className="mt-1 text-[12px] text-[var(--ink-3)]">
                      {DEAL_TYPE_LABELS[d.property.dealType] ?? d.property.dealType}
                      {d.property.region ? ` · ${d.property.region}` : ""}
                      {` · مشاور: ${d.agent.name}`}
                      {d.contractAt ? ` · قرارداد ${formatDate(d.contractAt)}` : ""}
                    </div>
                    {d.notes && <div className="mt-2 text-[12px] text-[var(--ink-3)]">{d.notes}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {d.status === "PENDING" && (
                      <>
                        <Button size="sm" variant="sea" onClick={() => setStatus(d.id, "COMPLETED")}>قطعی</Button>
                        <Button size="sm" variant="outline" onClick={() => setStatus(d.id, "CANCELED")}>لغو</Button>
                      </>
                    )}
                    {d.status === "COMPLETED" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(d.id, "CANCELED")}>لغو</Button>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
