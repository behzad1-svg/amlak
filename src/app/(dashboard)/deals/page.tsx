"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input, Label, PhoneInput, Select } from "@/components/ui/Input";
import { DEAL_STATUS_COLORS, DEAL_STATUS_LABELS } from "@/lib/dealConstants";
import { DEAL_TYPE_LABELS } from "@/lib/constants";
import { formatDate, formatToman } from "@/lib/utils";

type Deal = {
  id: string;
  status: string;
  contractAt: string | null;
  notes: string | null;
  commissionToman: string | null;
  commissionPercent: number | null;
  dealSalePriceToman: string | null;
  dealDepositToman: string | null;
  dealMonthlyRentToman: string | null;
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
    dealSalePriceToman: "",
    dealDepositToman: "",
    dealMonthlyRentToman: "",
    commissionToman: "",
    commissionPercent: "",
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

  useEffect(() => { load(); }, [load]);

  async function createDeal(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId || !form.propertyId) {
      flash("", "مشتری و فایل الزامی است");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      customerId: form.customerId,
      propertyId: form.propertyId,
      status: form.status,
      notes: form.notes || null,
    };
    if (form.dealSalePriceToman) body.dealSalePriceToman = form.dealSalePriceToman;
    if (form.dealDepositToman) body.dealDepositToman = form.dealDepositToman;
    if (form.dealMonthlyRentToman) body.dealMonthlyRentToman = form.dealMonthlyRentToman;
    if (form.commissionToman) body.commissionToman = form.commissionToman;
    if (form.commissionPercent) body.commissionPercent = Number(form.commissionPercent);

    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return flash("", j.error || "خطا در ثبت معامله");
    setShowForm(false);
    setForm({
      customerId: "",
      propertyId: "",
      status: "PENDING",
      dealSalePriceToman: "",
      dealDepositToman: "",
      dealMonthlyRentToman: "",
      commissionToman: "",
      commissionPercent: "",
      notes: "",
    });
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
            <form onSubmit={createDeal} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>مشتری</Label>
                <Select className="mt-1" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
                  <option value="">انتخاب کنید</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>فایل</Label>
                <Select className="mt-1" value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} required>
                  <option value="">انتخاب کنید</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>وضعیت</Label>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="PENDING">در جریان</option>
                  <option value="COMPLETED">قطعی</option>
                </Select>
              </div>
              <div>
                <Label>قیمت فروش (تومان)</Label>
                <PhoneInput className="mt-1" value={form.dealSalePriceToman} onChange={(e) => setForm({ ...form, dealSalePriceToman: e.target.value })} />
              </div>
              <div>
                <Label>ودیعه (تومان)</Label>
                <PhoneInput className="mt-1" value={form.dealDepositToman} onChange={(e) => setForm({ ...form, dealDepositToman: e.target.value })} />
              </div>
              <div>
                <Label>اجاره ماهانه (تومان)</Label>
                <PhoneInput className="mt-1" value={form.dealMonthlyRentToman} onChange={(e) => setForm({ ...form, dealMonthlyRentToman: e.target.value })} />
              </div>
              <div>
                <Label>کمیسیون (تومان)</Label>
                <PhoneInput className="mt-1" value={form.commissionToman} onChange={(e) => setForm({ ...form, commissionToman: e.target.value })} />
              </div>
              <div>
                <Label>کمیسیون (٪)</Label>
                <Input type="number" min={0} max={100} step={0.1} className="mt-1" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <Label>یادداشت</Label>
                <Input className="mt-1" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3 flex gap-2">
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
                    <div className="mt-2 flex flex-wrap gap-3 text-[12.5px]">
                      {d.dealSalePriceToman && <span>فروش: <b>{formatToman(d.dealSalePriceToman)}</b></span>}
                      {d.dealDepositToman && <span>ودیعه: <b>{formatToman(d.dealDepositToman)}</b></span>}
                      {d.dealMonthlyRentToman && <span>اجاره: <b>{formatToman(d.dealMonthlyRentToman)}</b></span>}
                      {(d.commissionToman || d.commissionPercent != null) && (
                        <span>
                          کمیسیون:{" "}
                          <b>
                            {d.commissionToman ? formatToman(d.commissionToman) : ""}
                            {d.commissionPercent != null ? `${d.commissionToman ? " · " : ""}${d.commissionPercent}٪` : ""}
                          </b>
                        </span>
                      )}
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
