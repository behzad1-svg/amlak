"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select, Label, Textarea } from "@/components/ui/Input";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { AppraisalCheck } from "@/components/properties/AppraisalCheck";
import { formatToman, formatDate } from "@/lib/utils";
import {
  PROPERTY_TYPE_LABELS,
  DEAL_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
} from "@/lib/constants";
import { useRole } from "@/hooks/useRole";

type Prop = Record<string, unknown> & {
  id: string;
  code?: string | null;
  title: string;
  type: string;
  dealType: string;
  status: string;
  region: string;
  address?: string | null;
  salePriceToman?: string | null;
  depositToman?: string | null;
  monthlyRentToman?: string | null;
  sizeSqm?: number | null;
  beds?: number | null;
  builtYear?: number | null;
  floor?: number | null;
  totalFloors?: number | null;
  unitsPerFloor?: number | null;
  unitCount?: number | null;
  landSizeSqm?: number | null;
  passageWidth?: number | null;
  buildingFrontage?: number | null;
  buildingFloors?: number | null;
  hasParking?: boolean;
  hasStorage?: boolean;
  hasElevator?: boolean;
  hasTerrace?: boolean;
  hasRenovated?: boolean;
  isNewBuild?: boolean;
  isAppraised?: boolean;
  appraisedAt?: string | null;
  listedBy?: { id: string; name: string } | null;
  owner?: { id: string; name: string; phone?: string } | null;
  appraisedBy?: { id: string; name: string } | null;
};

type Activity = {
  id: string;
  type: string;
  description: string | null;
  createdAt: string;
  agent?: { id: string; name: string } | null;
  customer?: { id: string; name: string } | null;
};

type Viewing = {
  id: string;
  startAt: string;
  endAt?: string | null;
  status: string;
  feedback?: string | null;
  customer?: { id: string; name: string };
  agent?: { id: string; name: string };
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-[var(--line)] last:border-0">
      <dt className="text-[12.5px] text-[var(--ink-3)]">{label}</dt>
      <dd className="text-[13px] font-medium text-left">{value}</dd>
    </div>
  );
}

function yesNo(v?: boolean) {
  return v ? "دارد" : null;
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOwner } = useRole();
  const [p, setP] = useState<Prop | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [customers, setCustomers] = useState<{ id: string; name: string; phone?: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [note, setNote] = useState("");
  const [noteCustomer, setNoteCustomer] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [visCustomer, setVisCustomer] = useState("");
  const [visDate, setVisDate] = useState<string | null>(null);
  const [visFeedback, setVisFeedback] = useState("");
  const [visAgent, setVisAgent] = useState("");
  const [visStatus, setVisStatus] = useState("SCHEDULED");
  const [savingVis, setSavingVis] = useState(false);
  const [agentsForAppraisal, setAgentsForAppraisal] = useState<{ id: string; name: string }[]>([]);

  const flash = (ok: string, bad?: string) => {
    setMsg(ok);
    setError(bad ?? "");
    setTimeout(() => { setMsg(""); setError(""); }, 3200);
  };

  const load = useCallback(async () => {
    const [propRes, actRes, visRes, custRes, usersRes] = await Promise.all([
      fetch(`/api/properties/${id}`).then((r) => r.json()),
      fetch(`/api/activities?propertyId=${id}`).then((r) => r.json()),
      fetch(`/api/viewings?propertyId=${id}`).then((r) => r.json()),
      fetch("/api/customers?limit=200").then((r) => r.json()),
      fetch("/api/users").then((r) => r.json()),
    ]);
    if (propRes?.id) {
      setP(propRes);
      setForm({
        title: propRes.title ?? "",
        region: propRes.region ?? "",
        status: propRes.status ?? "",
        salePriceToman: propRes.salePriceToman ?? "",
        depositToman: propRes.depositToman ?? "",
        monthlyRentToman: propRes.monthlyRentToman ?? "",
        listedById: propRes.listedBy?.id ?? "",
      });
    }
    setActivities(Array.isArray(actRes) ? actRes : []);
    setViewings(Array.isArray(visRes) ? visRes : []);
    const custs = Array.isArray(custRes) ? custRes : custRes?.customers ?? [];
    setCustomers(custs.map((c: { id: string; name: string; phone?: string }) => ({ id: c.id, name: c.name, phone: c.phone })));
    const us = Array.isArray(usersRes) ? usersRes : [];
    setAgents(us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
    setAgentsForAppraisal(us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [propRes, actRes, visRes, custRes, usersRes] = await Promise.all([
        fetch(`/api/properties/${id}`).then((r) => r.json()),
        fetch(`/api/activities?propertyId=${id}`).then((r) => r.json()),
        fetch(`/api/viewings?propertyId=${id}`).then((r) => r.json()),
        fetch("/api/customers?limit=200").then((r) => r.json()),
        fetch("/api/users").then((r) => r.json()),
      ]);
      if (!alive) return;
      if (propRes?.id) {
        setP(propRes);
        setForm({
          title: propRes.title ?? "",
          region: propRes.region ?? "",
          status: propRes.status ?? "",
          salePriceToman: propRes.salePriceToman ?? "",
          depositToman: propRes.depositToman ?? "",
          monthlyRentToman: propRes.monthlyRentToman ?? "",
          listedById: propRes.listedBy?.id ?? "",
        });
      }
      setActivities(Array.isArray(actRes) ? actRes : []);
      setViewings(Array.isArray(visRes) ? visRes : []);
      const custs = Array.isArray(custRes) ? custRes : custRes?.customers ?? [];
      setCustomers(custs.map((c: { id: string; name: string; phone?: string }) => ({ id: c.id, name: c.name, phone: c.phone })));
      const us = Array.isArray(usersRes) ? usersRes : [];
      setAgents(us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
      setAgentsForAppraisal(us.map((u: { id: string; name: string }) => ({ id: u.id, name: u.name })));
    })();
    return () => {
      alive = false;
    };
  }, [id, load]);

  async function save() {
    setError("");
    const body: Record<string, unknown> = { title: form.title, region: form.region, status: form.status };
    if (form.salePriceToman) body.salePriceToman = form.salePriceToman;
    if (form.depositToman) body.depositToman = form.depositToman;
    if (form.monthlyRentToman) body.monthlyRentToman = form.monthlyRentToman;
    if (isOwner && form.listedById) body.listedById = form.listedById;
    const res = await fetch(`/api/properties/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "خطا");
      return;
    }
    setEditing(false);
    flash("ذخیره شد");
    load();
  }

  async function handleDelete() {
    if (!confirm("حذف فایل؟ فقط مدیر می‌تواند حذف کند.")) return;
    const res = await fetch(`/api/properties/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      flash("", j.error || "حذف مجاز نیست");
      return;
    }
    router.push("/properties");
  }

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    const res = await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "NOTE",
        propertyId: id,
        customerId: noteCustomer || null,
        description: note.trim(),
      }),
    });
    setSavingNote(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      flash("", j.error || "خطا در ثبت یادداشت");
      return;
    }
    setNote("");
    flash("یادداشت ثبت شد");
    load();
  }

  async function addViewing() {
    if (!visCustomer || !visDate) {
      flash("", "مشتری و تاریخ بازدید الزامی است");
      return;
    }
    setSavingVis(true);
    const body: Record<string, unknown> = {
      customerId: visCustomer,
      propertyId: id,
      startAt: visDate,
      status: visStatus,
      feedback: visFeedback.trim() || null,
    };
    if (isOwner && visAgent) body.agentId = visAgent;
    if (visStatus === "DONE") body.endAt = visDate;
    const res = await fetch("/api/viewings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    setSavingVis(false);
    if (!res.ok) {
      flash("", j.error || "خطا در ثبت بازدید");
      return;
    }
    setVisFeedback("");
    flash("بازدید ثبت شد");
    load();
  }

  if (!p) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;

  const isSale = p.dealType === "SALE";
  const typeLabel = PROPERTY_TYPE_LABELS[p.type] ?? p.type;

  return (
    <div>
      <Header
        title={p.title}
        subtitle={`${p.code ? `${p.code} · ` : ""}${p.region} · ${typeLabel}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? "انصراف" : "ویرایش"}</Button>
            {isOwner && (
              <Button variant="ghost" onClick={handleDelete} className="text-red-600 hover:bg-red-50">حذف</Button>
            )}
          </div>
        }
      />
      <div className="p-6 space-y-5 max-w-4xl">
        {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {msg && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}

        {/* مشخصات کامل */}
        <Card>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {p.code && <Badge className="bg-[var(--ink)] text-white border-[var(--ink)]" dir="ltr">{p.code}</Badge>}
            <Badge>{typeLabel}</Badge>
            <Badge>{DEAL_TYPE_LABELS[p.dealType] ?? p.dealType}</Badge>
            <Badge>{PROPERTY_STATUS_LABELS[p.status] ?? p.status}</Badge>
            {p.isAppraised ? (
              <Badge className="bg-[var(--sea-soft)] text-[var(--sea)] border-[#C7E5E0]">کارشناسی‌شده</Badge>
            ) : (
              <Badge className="bg-amber-50 text-amber-700 border-amber-200">کارشناسی نشده</Badge>
            )}
          </div>
          <dl className="text-sm">
            <Row label="مشاور فایل" value={p.listedBy?.name ?? "—"} />
            <Row
              label="کارشناسی"
              value={
                p.isAppraised && p.appraisedBy
                  ? `${p.appraisedBy.name}${p.appraisedAt ? ` · ${formatDate(p.appraisedAt as string)}` : ""}`
                  : "—"
              }
            />
            <Row
              label="مالک"
              value={
                p.owner ? (
                  <span className="text-left">
                    <span>{String(p.owner.name || "").trim() || "—"}</span>
                    {p.owner.phone ? (
                      <span dir="ltr" className="block text-[12px] text-[var(--ink-3)]">{p.owner.phone}</span>
                    ) : null}
                  </span>
                ) : "—"
              }
            />
            <Row label="منطقه" value={p.region} />
            <Row label="آدرس" value={p.address || "—"} />
            <Row
              label={isSale ? "قیمت فروش" : "رهن / اجاره"}
              value={
                isSale
                  ? formatToman(p.salePriceToman)
                  : `${formatToman(p.depositToman)} / ${formatToman(p.monthlyRentToman)}`
              }
            />
            <Row label={p.type === "VILLA" || p.type === "KOLANGI" ? "متراژ مسکونی (زیربنا)" : "متراژ کل"} value={p.sizeSqm != null ? `${p.sizeSqm} متر` : null} />
            <Row label="متراژ زمین" value={p.landSizeSqm != null ? `${p.landSizeSqm} متر` : null} />
            <Row label="سال ساخت" value={p.builtYear} />
            <Row label="طبقه" value={p.floor} />
            <Row label="تعداد طبقات" value={p.totalFloors ?? p.buildingFloors} />
            <Row label="واحد در هر طبقه" value={p.unitsPerFloor} />
            <Row label="تعداد کل واحد" value={p.unitCount} />
            <Row label="تعداد خواب" value={p.beds != null ? `${p.beds} خواب` : null} />
            <Row label="عرض گذر" value={p.passageWidth != null ? `${p.passageWidth} متر` : null} />
            <Row label="برِ ملک" value={p.buildingFrontage != null ? `${p.buildingFrontage} متر` : null} />
            <Row label="پارکینگ" value={yesNo(p.hasParking)} />
            <Row label="انباری" value={yesNo(p.hasStorage)} />
            <Row label="آسانسور" value={yesNo(p.hasElevator)} />
            <Row label="تراس" value={yesNo(p.hasTerrace)} />
            <Row label="بازسازی‌شده" value={yesNo(p.hasRenovated)} />
            <Row label="نوساز" value={yesNo(p.isNewBuild)} />
            <div className="flex items-center justify-between gap-3 py-2 border-b border-[var(--line)] last:border-0">
              <dt className="text-[12.5px] text-[var(--ink-3)]">کارشناسی</dt>
              <dd>
                <AppraisalCheck
                  key={`${p.id}-${p.isAppraised ? "on" : "off"}`}
                  propertyId={p.id}
                  isAppraised={!!p.isAppraised}
                  appraisedByName={p.appraisedBy?.name}
                  appraisedAt={(p.appraisedAt as string) || null}
                  isOwner={isOwner}
                  onChanged={load}
                />
              </dd>
            </div>
          </dl>
        </Card>

        {editing && (
          <Card>
            <h3 className="font-semibold mb-3">ویرایش فایل</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>عنوان</Label><Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label>منطقه</Label><Input className="mt-1" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
              <div>
                <Label>وضعیت</Label>
                <Select className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">فعال</option>
                  <option value="RESERVED">رزرو</option>
                  <option value="SOLD">فروخته‌شده</option>
                  <option value="RENTED">اجاره‌رفته</option>
                </Select>
              </div>
              {isOwner && (
                <div>
                  <Label>مشاور مسئول فایل</Label>
                  <Select className="mt-1" value={form.listedById} onChange={(e) => setForm({ ...form, listedById: e.target.value })}>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </div>
              )}
              <div><Label>قیمت فروش</Label><Input className="mt-1" dir="ltr" value={form.salePriceToman} onChange={(e) => setForm({ ...form, salePriceToman: e.target.value })} /></div>
              <div><Label>ودیعه</Label><Input className="mt-1" dir="ltr" value={form.depositToman} onChange={(e) => setForm({ ...form, depositToman: e.target.value })} /></div>
              <div><Label>اجاره ماهانه</Label><Input className="mt-1" dir="ltr" value={form.monthlyRentToman} onChange={(e) => setForm({ ...form, monthlyRentToman: e.target.value })} /></div>
            </div>
            <div className="mt-3"><Button onClick={save}>ذخیره</Button></div>
          </Card>
        )}

        {/* ثبت بازدید */}
        <Card>
          <h3 className="font-semibold mb-3">ثبت بازدید روی این فایل</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <SearchSelect
                label="مشتری"
                required
                value={visCustomer}
                onChange={setVisCustomer}
                options={customers.map((c) => ({ id: c.id, label: c.name, sub: c.phone }))}
                placeholder="جستجوی مشتری (نام یا شماره)..."
              />
            </div>
            <div>
              <Label>تاریخ بازدید (شمسی) *</Label>
              <div className="mt-1"><JalaliDatePicker value={visDate} onChange={setVisDate} /></div>
            </div>
            <div>
              <Label>وضعیت</Label>
              <Select className="mt-1" value={visStatus} onChange={(e) => setVisStatus(e.target.value)}>
                <option value="SCHEDULED">برنامه‌ریزی‌شده</option>
                <option value="DONE">انجام شد</option>
              </Select>
            </div>
            {isOwner && (
              <div>
                <SearchSelect
                  label="مشاور (برای مدیر)"
                  value={visAgent}
                  onChange={setVisAgent}
                  options={agents.map((a) => ({ id: a.id, label: a.name }))}
                  placeholder="خودم"
                />
              </div>
            )}
            <div className="md:col-span-2">
              <Label>گزارش بازدید</Label>
              <Textarea
                className="mt-1"
                rows={2}
                value={visFeedback}
                onChange={(e) => setVisFeedback(e.target.value)}
                placeholder="مثلا: @رضا رفتیم بازدید، خونه خیلی کثیف بود"
              />
            </div>
          </div>
          <div className="mt-3">
            <Button onClick={addViewing} disabled={savingVis}>{savingVis ? "..." : "ثبت بازدید"}</Button>
          </div>

          {viewings.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-[12px] font-bold text-[var(--ink-2)]">بازدیدهای ثبت‌شده ({viewings.length})</div>
              {viewings.map((v) => (
                <div key={v.id} className="rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="text-[11px]">{v.status === "DONE" ? "انجام شد" : v.status === "CANCELED" ? "لغو" : "برنامه‌ریزی"}</Badge>
                    <span className="font-bold">{formatDate(v.startAt)}</span>
                    {v.customer && (
                      <Link href={`/customers/${v.customer.id}`} className="text-[var(--ink-2)] hover:underline">
                        {v.customer.name}
                      </Link>
                    )}
                    <span className="text-[12px] text-[var(--ink-3)]">مشاور: {v.agent?.name ?? "—"}</span>
                  </div>
                  {v.feedback && <div className="mt-1 text-[var(--ink-2)]">{v.feedback}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* یادداشت روی فایل */}
        <Card>
          <h3 className="font-semibold mb-3">یادداشت روی فایل</h3>
          <p className="text-[12px] text-[var(--ink-3)] mb-2">
            پیشنهاد: یادداشت مربوط به <b>خود ملک</b> را اینجا بگذارید؛ نکات مربوط به مشتری در پرونده همان مشتری. بازدید همیشه با مشاور + تاریخ ثبت می‌شود.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="sm:w-64">
              <SearchSelect
                label="ارجاع به مشتری"
                value={noteCustomer}
                onChange={setNoteCustomer}
                options={customers.map((c) => ({ id: c.id, label: c.name, sub: c.phone }))}
                placeholder="بدون ارجاع"
              />
            </div>
            <Input
              className="flex-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلا: @رضا رفتیم بازدید، خونه خیلی کثیف بود"
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <Button onClick={addNote} disabled={savingNote || !note.trim()}>{savingNote ? "..." : "ثبت"}</Button>
          </div>

          <div className="mt-4 space-y-2">
            <div className="text-[12px] font-bold text-[var(--ink-2)]">تاریخچه فعالیت فایل</div>
            {activities.length === 0 ? (
              <p className="text-sm text-[var(--ink-3)]">هنوز فعالیتی ثبت نشده.</p>
            ) : (
              activities.map((a) => (
                <div key={a.id} className="rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2 text-[12px]">
                    <Badge className="text-[11px]">{ACTIVITY_TYPE_LABELS[a.type] ?? a.type}</Badge>
                    <span className="font-bold">{a.agent?.name ?? "—"}</span>
                    <span className="text-[var(--ink-3)]">{formatDate(a.createdAt)}</span>
                    {a.customer && (
                      <Link href={`/customers/${a.customer.id}`} className="text-[var(--sea)] hover:underline">
                        {a.customer.name}
                      </Link>
                    )}
                  </div>
                  {a.description && <div className="mt-1">{a.description}</div>}
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
