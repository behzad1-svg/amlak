"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, NumberInput, Select, Label, Textarea } from "@/components/ui/Input";
import dynamic from "next/dynamic";
import { SearchSelect } from "@/components/ui/SearchSelect";
import { AppraisalCheck } from "@/components/properties/AppraisalCheck";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";

// نقد ۹ — انتخابگر تاریخ با next/dynamic تنبل بارگذاری می‌شود
const JalaliDatePicker = dynamic(
  () => import("@/components/ui/JalaliDatePicker").then((m) => m.JalaliDatePicker),
  { ssr: false, loading: () => <div className="h-10 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] animate-pulse" /> }
);
import { formatDate, toEnDigits } from "@/lib/utils";
import { MoneyText } from "@/components/ui/MoneyText";
import { formatTomanWithWords } from "@/lib/money";
import {
  PROPERTY_TYPE_LABELS,
  DEAL_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  ACTIVITY_TYPE_LABELS,
  CUSTOMER_SOURCE_LABELS,
  CUSTOMER_SOURCE_OPTIONS,
} from "@/lib/constants";
import { useRole } from "@/hooks/useRole";
import { hasPermission } from "@/lib/permissions";

type Prop = Record<string, unknown> & {
  id: string;
  code?: string | null;
  title: string;
  type: string;
  dealType: string;
  status: string;
  source?: string | null;
  region: string;
  address?: string | null;
  description?: string | null;
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
  accessList?: { userId: string; user: { id: string; name: string } }[];
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
      <dt className="shrink-0 text-[12.5px] text-[var(--ink-3)]">{label}</dt>
      <dd className="min-w-0 break-words text-[13px] font-medium text-left">{value}</dd>
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
  const [agents, setAgents] = useState<{ id: string; name: string; role?: string; active?: boolean }[]>([]);
  const [accessUserIds, setAccessUserIds] = useState<string[]>([]);
  const [meId, setMeId] = useState("");
  const [mePermissions, setMePermissions] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [pricePerSqm, setPricePerSqm] = useState("");
  const lastPriceField = useRef<"total" | "perMetre" | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [note, setNote] = useState("");
  const [noteCustomer, setNoteCustomer] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const [visCustomer, setVisCustomer] = useState("");
  const [visDate, setVisDate] = useState<string | null>(null);
  const [visFeedback, setVisFeedback] = useState("");
  const [visAgent, setVisAgent] = useState("");
  const [visStatus, setVisStatus] = useState("SCHEDULED");
  const [savingVis, setSavingVis] = useState(false);

  // پیام موفقیت خودبه‌خود پاک می‌شود؛ پیام خطا تا اقدام بعدی می‌ماند
  const flash = (ok: string, bad?: string) => {
    setMsg(ok);
    setError(bad ?? "");
    if (ok) setTimeout(() => setMsg(""), 3200);
  };

  // نقد ۱ — بارگذاری با کمک‌کنندهٔ مرکزی؛ خطا پیام + تلاش دوباره دارد
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [propRes, actRes, visRes, custRes, usersRes, meRes] = await Promise.all([
        apiJson<Prop>(`/api/properties/${id}`),
        apiJson<Activity[]>(`/api/activities?propertyId=${id}`),
        apiJson<Viewing[]>(`/api/viewings?propertyId=${id}`),
        apiJson<{ customers?: { id: string; name: string; phone?: string }[] } | { id: string; name: string; phone?: string }[]>("/api/customers?limit=200"),
        apiJson<{ id: string; name: string; role?: string; active?: boolean }[]>("/api/users"),
        apiJson<{ user?: { id: string; permissions?: Record<string, boolean> } }>("/api/auth/me"),
      ]);
      if (meRes?.user?.id) setMeId(meRes.user.id);
      if (meRes?.user?.permissions) setMePermissions(meRes.user.permissions);
      if (propRes?.id) {
        setP(propRes);
        setAccessUserIds((propRes.accessList ?? []).map((a) => a.userId));
        setForm({
          title: propRes.title ?? "",
          region: propRes.region ?? "",
          status: propRes.status ?? "",
          salePriceToman: propRes.salePriceToman ?? "",
          depositToman: propRes.depositToman ?? "",
          monthlyRentToman: propRes.monthlyRentToman ?? "",
          listedById: propRes.listedBy?.id ?? "",
          source: (propRes.source as string) ?? "",
          description: propRes.description ?? "",
        });
        // متری از قیمت و متراژ ثبت‌شده محاسبه می‌شود
        const base =
          propRes.type === "VILLA" || propRes.type === "KOLANGI" || propRes.type === "LAND"
            ? propRes.landSizeSqm
            : propRes.sizeSqm;
        if (propRes.dealType === "SALE" && propRes.salePriceToman && base) {
          const n = Math.round(Number(propRes.salePriceToman) / base);
          setPricePerSqm(Number.isFinite(n) && n > 0 ? String(n) : "");
        } else {
          setPricePerSqm("");
        }
      }
      setActivities(Array.isArray(actRes) ? actRes : []);
      setViewings(Array.isArray(visRes) ? visRes : []);
      const custs = Array.isArray(custRes) ? custRes : custRes?.customers ?? [];
      setCustomers(custs.map((c: { id: string; name: string; phone?: string }) => ({ id: c.id, name: c.name, phone: c.phone })));
      const us = Array.isArray(usersRes) ? usersRes : [];
      setAgents(us.map((u: { id: string; name: string; role?: string; active?: boolean }) => ({ id: u.id, name: u.name, role: u.role, active: u.active })));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  async function save() {
    setError("");
    const body: Record<string, unknown> = { title: form.title, region: form.region, status: form.status };
    if (form.salePriceToman) body.salePriceToman = form.salePriceToman;
    if (form.depositToman) body.depositToman = form.depositToman;
    if (form.monthlyRentToman) body.monthlyRentToman = form.monthlyRentToman;
    body.description = form.description?.trim() ? form.description.trim() : null;
    body.source = form.source || null;
    if (isOwner && form.listedById) body.listedById = form.listedById;
    if (canManageAccess) body.accessUserIds = accessUserIds;
    try {
      await apiFetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    setEditing(false);
    flash("ذخیره شد");
    load();
  }

  async function handleDelete() {
    if (!confirm("حذف فایل؟ این کار برگشت‌پذیر نیست.")) return;
    try {
      await apiFetch(`/api/properties/${id}`, { method: "DELETE" });
    } catch (e) {
      flash("", errorMessage(e));
      return;
    }
    router.push("/properties");
  }

  async function handleArchive() {
    const archiving = p?.status !== "ARCHIVED";
    if (!confirm(archiving ? "فایل بایگانی شود؟ دیگر در فهرست اصلی دیده نمی‌شود." : "فایل از بایگانی برگردد؟")) return;
    try {
      await apiFetch(`/api/properties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: archiving ? "ARCHIVED" : "ACTIVE" }),
      });
    } catch (e) {
      flash("", errorMessage(e));
      return;
    }
    flash(archiving ? "فایل بایگانی شد" : "فایل برگشت");
    load();
  }

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    try {
      await apiFetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "NOTE",
          propertyId: id,
          customerId: noteCustomer || null,
          description: note.trim(),
        }),
      });
    } catch (e) {
      setSavingNote(false);
      flash("", errorMessage(e));
      return;
    }
    setSavingNote(false);
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
    try {
      await apiFetch("/api/viewings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      setSavingVis(false);
      flash("", errorMessage(e));
      return;
    }
    setSavingVis(false);
    setVisFeedback("");
    flash("بازدید ثبت شد");
    load();
  }

  if (loading && !p) return <PageSkeleton rows={4} />;
  if (loadError && !p) return <PageError message={loadError} onRetry={load} />;
  if (!p) return <PageSkeleton rows={4} />;

  const isSale = p.dealType === "SALE";
  // متراژ مبنا برای متری: زمین/ویلا/کلنگی → متراژ زمین، بقیه → متراژ
  const detailBaseSize =
    p.type === "VILLA" || p.type === "KOLANGI" || p.type === "LAND" ? p.landSizeSqm : p.sizeSqm;
  const detailPerMetre =
    isSale && p.salePriceToman && detailBaseSize ? Math.round(Number(p.salePriceToman) / detailBaseSize) : null;
  const perMetreWords = pricePerSqm ? formatTomanWithWords(pricePerSqm).words : "";
  // محاسبه دوطرفه قیمت کل و متری در ویرایش، مثل محاسبه خودکار کمیسیون
  function onEditSalePrice(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setForm((f) => ({ ...f, salePriceToman: clean }));
    lastPriceField.current = "total";
    if (clean !== "" && detailBaseSize) {
      const n = Math.round(Number(clean) / detailBaseSize);
      if (Number.isFinite(n) && n > 0) setPricePerSqm(String(n));
    }
  }
  function onEditPerMetre(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setPricePerSqm(clean);
    lastPriceField.current = "perMetre";
    if (clean !== "" && detailBaseSize) {
      const n = Math.round(Number(clean) * detailBaseSize);
      if (Number.isFinite(n) && n > 0) setForm((f) => ({ ...f, salePriceToman: String(n) }));
    }
  }
  const typeLabel = PROPERTY_TYPE_LABELS[p.type] ?? p.type;
  const canManageAccess = isOwner || p.listedBy?.id === meId;
  const canArchive = isOwner || (p.listedBy?.id === meId && hasPermission({ role: "AGENT", permissions: mePermissions }, "canArchiveProperty"));
  const accessCandidates = agents.filter((a) => a.role === "AGENT" && a.id !== meId && a.active !== false);

  return (
    <div>
      <Header
        title={p.title}
        subtitle={`${p.code ? `${p.code} · ` : ""}${p.region} · ${typeLabel}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? "انصراف" : "ویرایش"}</Button>
            {canArchive && (
              <Button variant="outline" onClick={handleArchive}>{p.status === "ARCHIVED" ? "بازگردانی" : "بایگانی"}</Button>
            )}
            {isOwner && (
              <Button variant="ghost" onClick={handleDelete} className="text-red-600 hover:bg-red-50">حذف</Button>
            )}
          </div>
        }
      />
      <div className="p-4 sm:p-6 space-y-5 max-w-4xl">
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
            <Row label="منبع" value={p.source ? (CUSTOMER_SOURCE_LABELS[p.source as string] ?? p.source) : null} />
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
            {p.description ? (
              <div className="py-1.5 border-b border-[var(--line)] last:border-0">
                <dt className="text-[12.5px] text-[var(--ink-3)]">توضیحات</dt>
                <dd className="mt-1 text-[13px] leading-6 whitespace-pre-wrap">{p.description}</dd>
              </div>
            ) : null}
            <Row
              label={isSale ? "قیمت فروش" : "رهن / اجاره"}
              value={
                isSale ? (
                  <>
                    <MoneyText value={p.salePriceToman} />
                    {detailPerMetre ? (
                      <span className="text-[12px] text-[var(--ink-3)]">
                        {" "}· متری{" "}{formatTomanWithWords(String(detailPerMetre)).formatted}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <>
                    ودیعه {p.depositToman ? <MoneyText value={p.depositToman} /> : "—"}
                    {" / "}
                    اجاره {p.monthlyRentToman ? <MoneyText value={p.monthlyRentToman} /> : "—"}
                  </>
                )
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
              <dt className="shrink-0 text-[12.5px] text-[var(--ink-3)]">کارشناسی</dt>
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
              <div><Label htmlFor="f-title">عنوان</Label><Input id="f-title" className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div><Label htmlFor="f-region">منطقه</Label><Input id="f-region" className="mt-1" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></div>
              <div>
                <Label htmlFor="f-status">وضعیت</Label>
                <Select id="f-status" className="mt-1" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option value="ACTIVE">فعال</option>
                  <option value="SOLD">فروخته‌شده</option>
                  <option value="RENTED">اجاره‌رفته</option>
                  <option value="ARCHIVED">بایگانی‌شده</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="f-source">منبع فایل</Label>
                <Select id="f-source" className="mt-1" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  <option value="">—</option>
                  {CUSTOMER_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{CUSTOMER_SOURCE_LABELS[s] ?? s}</option>)}
                </Select>
              </div>
              {isOwner && (
                <div>
                  <Label htmlFor="f-listedById">مشاور مسئول فایل</Label>
                  <Select id="f-listedById" className="mt-1" value={form.listedById} onChange={(e) => setForm({ ...form, listedById: e.target.value })}>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </div>
              )}
              <div><Label htmlFor="f-salePriceToman">قیمت فروش</Label><Input id="f-salePriceToman" className="mt-1" dir="ltr" value={form.salePriceToman} onChange={(e) => onEditSalePrice(e.target.value)} /></div>
              {isSale && (
                <div>
                  <Label htmlFor="f-pricePerSqm">قیمت هر متر (تومان)</Label>
                  <NumberInput id="f-pricePerSqm" className="mt-1" value={pricePerSqm} onChange={(e) => onEditPerMetre(e.target.value)} disabled={!detailBaseSize} />
                  {perMetreWords ? (
                    <p className="mt-1 text-xs text-[var(--ink-3)]">{perMetreWords}</p>
                  ) : !detailBaseSize ? (
                    <p className="mt-1 text-xs text-[var(--ink-3)]">متراژ ثبت نشده است</p>
                  ) : null}
                </div>
              )}
              <div><Label htmlFor="f-depositToman">ودیعه</Label><Input id="f-depositToman" className="mt-1" dir="ltr" value={form.depositToman} onChange={(e) => setForm({ ...form, depositToman: e.target.value })} /></div>
              <div><Label htmlFor="f-monthlyRentToman">اجاره ماهانه</Label><Input id="f-monthlyRentToman" className="mt-1" dir="ltr" value={form.monthlyRentToman} onChange={(e) => setForm({ ...form, monthlyRentToman: e.target.value })} /></div>
              <div className="md:col-span-2">
                <Label htmlFor="f-description">توضیحات فایل</Label>
                <Textarea id="f-description" className="mt-1" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="نکات فایل: مالک عجله دارد، قیمت قابل مذاکره است..." />
              </div>
              {canManageAccess && (
                <div className="md:col-span-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
                  <div className="text-[13px] font-bold mb-1">دسترسی کامل مشاورهای دیگر</div>
                  <p className="text-[12px] text-[var(--ink-3)] mb-2">
                    مشاورهای تیک‌خورده آدرس دقیق، نام و شماره مالک را می‌بینند. بقیه فقط اطلاعات جزئی فایل را می‌بینند.
                  </p>
                  {accessCandidates.length === 0 ? (
                    <p className="text-[13px] text-[var(--ink-3)]">مشاور دیگری در سیستم نیست.</p>
                  ) : (
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                      {accessCandidates.map((a) => (
                        <label key={a.id} className="flex items-center gap-2 text-[13px] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={accessUserIds.includes(a.id)}
                            onChange={() =>
                              setAccessUserIds((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id]))
                            }
                          />
                          {a.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
              <Label htmlFor="f-visDate">تاریخ بازدید (شمسی) *</Label>
              <div className="mt-1"><JalaliDatePicker id="f-visDate" value={visDate} onChange={setVisDate} /></div>
            </div>
            <div>
              <Label htmlFor="f-visStatus">وضعیت</Label>
              <Select id="f-visStatus" className="mt-1" value={visStatus} onChange={(e) => setVisStatus(e.target.value)}>
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
              <Label htmlFor="f-visFeedback">گزارش بازدید</Label>
              <Textarea id="f-visFeedback"
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
