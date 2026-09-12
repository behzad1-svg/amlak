"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label } from "@/components/ui/Input";
import { formatToman, formatDate } from "@/lib/utils";
import { PROPERTY_TYPE_LABELS, DEAL_TYPE_LABELS } from "@/lib/constants";

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [p, setP] = useState<Record<string, unknown> | null>(null);
  const [activities, setActivities] = useState<{ id: string; type: string; description: string | null; createdAt: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  function load() {
    fetch(`/api/properties/${id}`).then((r) => r.json()).then((d) => { if (d.id) { setP(d); setForm({ title: d.title ?? "", region: d.region ?? "", status: d.status ?? "", salePriceToman: d.salePriceToman ?? "", depositToman: d.depositToman ?? "", monthlyRentToman: d.monthlyRentToman ?? "" }); } });
    fetch(`/api/activities?propertyId=${id}`).then((r) => r.json()).then((d) => setActivities(Array.isArray(d) ? d : []));
  }
  useEffect(() => { load(); }, [id]);

  async function save() {
    setError("");
    const body: Record<string, unknown> = { title: form.title, region: form.region, status: form.status };
    if (form.salePriceToman) body.salePriceToman = form.salePriceToman;
    if (form.depositToman) body.depositToman = form.depositToman;
    if (form.monthlyRentToman) body.monthlyRentToman = form.monthlyRentToman;
    const res = await fetch(`/api/properties/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "خطا"); return; }
    setEditing(false); load();
  }

  if (!p) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;

  return (
    <div>
      <Header title={p.title as string} subtitle={(p.region as string) ?? ""} action={<div className="flex gap-2"><Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? "انصراف" : "ویرایش"}</Button><Button variant="ghost" onClick={async () => { if (!confirm("حذف فایل؟")) return; await fetch(`/api/properties/${id}`, { method: "DELETE" }); router.push("/properties"); }}>حذف</Button></div>} />
      <div className="p-6 space-y-6 max-w-3xl">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <Card>
          <div className="space-y-2 text-sm">
            <div className="flex gap-2"><Badge>{PROPERTY_TYPE_LABELS[p.type as string] ?? p.type as string}</Badge><Badge>{DEAL_TYPE_LABELS[p.dealType as string] ?? p.dealType as string}</Badge><Badge>{p.status as string}</Badge></div>
            <div>قیمت: {(p.dealType as string) === "SALE" ? formatToman(p.salePriceToman as string) : `${formatToman(p.depositToman as string)} / ${formatToman(p.monthlyRentToman as string)}`}</div>
            {p.sizeSqm ? <div>متراژ: {p.sizeSqm as string} متر</div> : null}
            {p.address ? <div>آدرس: {p.address as string}</div> : null}
            <div>مالک: {(p.owner as { name: string })?.name ?? "—"}</div>
            <div>ثبت‌کننده: {(p.listedBy as { name: string })?.name ?? "—"}</div>
          </div>
        </Card>
        {editing && <Card><div className="space-y-3"><div><Label>عنوان</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1" /></div><div><Label>منطقه</Label><Input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="mt-1" /></div><div><Label>وضعیت</Label><Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="mt-1"><option value="ACTIVE">فعال</option><option value="RESERVED">رزرو</option><option value="SOLD">فروخته‌شده</option><option value="RENTED">اجاره‌رفته</option></Select></div><Button onClick={save}>ذخیره</Button></div></Card>}
        <Card><h3 className="font-semibold mb-3">فعالیت‌ها</h3>{activities.length === 0 ? <p className="text-sm text-zinc-400">فعالیتی ثبت نشده</p> : activities.map((a) => <div key={a.id} className="flex justify-between py-2 border-b last:border-0 text-sm"><span>{a.description ?? a.type}</span><span className="text-zinc-400">{formatDate(a.createdAt)}</span></div>)}</Card>
      </div>
    </div>
  );
}
