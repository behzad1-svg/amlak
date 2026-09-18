"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Label, PhoneInput } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatToman } from "@/lib/utils";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { MoneyInput } from "@/components/ui/MoneyInput";
import {
  CUSTOMER_STAGE_LABELS,
  CUSTOMER_STAGE_COLORS,
  LOST_REASON_LABELS,
  ACTIVITY_TYPE_LABELS,
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_SOURCE_LABELS,
  PROPERTY_TYPE_LABELS,
  DEAL_TYPE_LABELS,
  TEMPERATURE_LABELS,
  TEMPERATURE_COLORS,
} from "@/lib/constants";
import { Phone, MapPin, Home, Wallet, Ruler, BedDouble, Calendar, User, StickyNote, AlertTriangle, Pencil, Trash2, Plus } from "lucide-react";
import { StageOutcomeModal, type OutcomeKind } from "@/components/customers/StageOutcomeModal";
import { useRole } from "@/hooks/useRole";

type Customer = Record<string, unknown> & {
  id: string; name: string; phone: string; type: string; stage: string; temperature: string;
  source: string | null; notes: string | null;
  preferredType: string | null; preferredDealType: string | null; preferredArea: string | null; preferredAreas: string[]; description: string | null;
  preferredBeds: number | null; preferredSizeMin: number | null; preferredSizeMax: number | null;
  budgetMin: string | null; budgetMax: string | null;
  nextFollowUpAt: string | null; needsManagerReview: boolean; managerReviewReason: string | null;
  lostReasonCategory: string | null; lostReasonDetail: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: string;
};

type Activity = { id: string; type: string; description: string | null; createdAt: string; agent: { name: string } };
type FollowUp = { id: string; dueAt: string; note: string | null; done: boolean };

type CustomerForm = {
  name: string;
  phone: string;
  notes: string;
  description: string;
  nextFollowUpAt: string;
  stage: string;
  temperature: string;
  type: string;
  source: string;
  preferredType: string;
  preferredDealType: string;
  preferredArea: string;
  preferredAreas: string[];
  preferredBeds: string;
  preferredSizeMin: string;
  preferredSizeMax: string;
  budgetMin: string;
  budgetMax: string;
  budgetMaxMonthly: string;
  lostReasonCategory: string;
  lostReasonDetail: string;
  needsManagerReview: string;
  managerReviewReason: string;
};

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isOwner } = useRole();
  const [c, setC] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CustomerForm>({
    name: "", phone: "", notes: "", description: "", nextFollowUpAt: "",
    stage: "", temperature: "", type: "", source: "",
    preferredType: "", preferredDealType: "", preferredArea: "",
    preferredAreas: [], preferredBeds: "", preferredSizeMin: "", preferredSizeMax: "",
    budgetMin: "", budgetMax: "", budgetMaxMonthly: "", lostReasonCategory: "", lostReasonDetail: "",
    needsManagerReview: "false", managerReviewReason: "",
  });
  const [error, setError] = useState("");
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState("NOTE");
  const [savingActivity, setSavingActivity] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [newFollowUpDate, setNewFollowUpDate] = useState<string | null>(null);
  const [newFollowUpNote, setNewFollowUpNote] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [outcome, setOutcome] = useState<OutcomeKind | null>(null);
  const [outcomeMsg, setOutcomeMsg] = useState("");

  function load() {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.id) {
          setC(d);
          setForm({
            name: d.name ?? "", phone: d.phone ?? "", notes: d.notes ?? "", description: d.description ?? "",
            nextFollowUpAt: d.nextFollowUpAt ?? "",
            stage: d.stage ?? "", temperature: d.temperature ?? "",
            type: d.type ?? "", source: d.source ?? "",
            preferredType: d.preferredType ?? "", preferredDealType: d.preferredDealType ?? "",
            preferredArea: d.preferredArea ?? "", preferredAreas: d.preferredAreas ?? [],
            preferredBeds: d.preferredBeds != null ? String(d.preferredBeds) : "",
            preferredSizeMin: d.preferredSizeMin != null ? String(d.preferredSizeMin) : "",
            preferredSizeMax: d.preferredSizeMax != null ? String(d.preferredSizeMax) : "",
            budgetMin: d.budgetMin ?? "", budgetMax: d.budgetMax ?? "",
            budgetMaxMonthly: d.budgetMaxMonthly ?? "",
            lostReasonCategory: d.lostReasonCategory ?? "", lostReasonDetail: d.lostReasonDetail ?? "",
            needsManagerReview: d.needsManagerReview ? "true" : "false",
            managerReviewReason: d.managerReviewReason ?? "",
          });
        }
      });
    fetch(`/api/customers/${id}/follow-ups`).then((r) => r.json()).then((d) => setFollowUps(Array.isArray(d) ? d : []));
    fetch(`/api/activities?customerId=${id}`)
      .then((r) => r.json())
      .then((d) => {
        const list = Array.isArray(d) ? d : (Array.isArray(d.activities) ? d.activities : []);
        setActivities(list);
      });
  }
  useEffect(() => { load(); fetch("/api/settings").then((r)=>r.json()).then((d)=>{ if(d.regions) setRegions(d.regions); if(d.propertyTypes) setPropertyTypes(d.propertyTypes); }); }, [id]);

  async function save() {
    setError("");
    const body: Record<string, unknown> = {
      name: form.name, phone: form.phone, notes: form.notes || null, description: form.description || null,
      stage: form.stage, temperature: form.temperature, type: form.type,
      source: form.source || null,
      preferredType: form.preferredType || null,
      preferredDealType: form.preferredDealType || null,
      preferredArea: form.preferredArea || null, preferredAreas: form.preferredAreas ?? [],
      preferredBeds: form.preferredBeds ? parseInt(form.preferredBeds, 10) : null,
      preferredSizeMin: form.preferredSizeMin ? parseFloat(form.preferredSizeMin) : null,
      preferredSizeMax: form.preferredSizeMax ? parseFloat(form.preferredSizeMax) : null,
      budgetMin: form.budgetMin || null,
      budgetMax: form.budgetMax || null,
      budgetMaxMonthly: form.preferredDealType === "RENT" ? (form.budgetMaxMonthly || null) : null,
      nextFollowUpAt: form.nextFollowUpAt || null,
      needsManagerReview: form.needsManagerReview === "true",
      managerReviewReason: form.managerReviewReason || null,
    };
    if (form.stage === "LOST" && !form.lostReasonCategory) { setError("دلیل از دست رفتن الزامی است"); return; }
    if (form.lostReasonCategory) { body.lostReasonCategory = form.lostReasonCategory; body.lostReasonDetail = form.lostReasonDetail || null; }
    const res = await fetch(`/api/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "خطا"); return; }
    setEditing(false); load();
  }

  async function handleDelete() {
    if (!confirm("حذف مشتری؟ فقط مدیر می‌تواند حذف کند.")) return;
    const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setOutcomeMsg(j.error || "حذف مجاز نیست");
      setTimeout(() => setOutcomeMsg(""), 3000);
      return;
    }
    router.push("/customers");
  }

  async function addActivity() {
    if (!activityText.trim()) return;
    setSavingActivity(true);
    const res = await fetch("/api/activities", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: activityType, customerId: id, description: activityText }),
    });
    if (res.ok) { setActivityText(""); load(); }
    setSavingActivity(false);
  }

  async function submitOutcome(payload: {
    stage: OutcomeKind;
    notes?: string | null;
    lostReasonCategory?: string;
    lostReasonDetail?: string | null;
    propertyId?: string | null;
  }) {
    // ۱) اگر موفق و فایل انتخاب شده: معامله قطعی → فایل SOLD/RENTED (بایگانی)
    if (payload.stage === "WON" && payload.propertyId) {
      const dealRes = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: id,
          propertyId: payload.propertyId,
          status: "COMPLETED",
          notes: payload.notes || "موفق — از پروفایل مشتری ثبت شد",
        }),
      });
      if (!dealRes.ok) {
        const j = await dealRes.json().catch(() => ({}));
        // اگر برای این فایل قبلا معامله باز هست، فقط مرحله مشتری را بزن
        if (dealRes.status !== 409) {
          throw new Error(j.error || "خطا در ثبت معامله/بایگانی فایل");
        }
      }
    }

    // ۲) مرحله مشتری + یادداشت/دلیل
    const body: Record<string, unknown> = { stage: payload.stage };
    if (payload.stage === "WON") {
      body.notes = payload.notes || null;
      body.nextFollowUpAt = null;
    } else {
      body.lostReasonCategory = payload.lostReasonCategory || "OTHER";
      body.lostReasonDetail = payload.lostReasonDetail || null;
      body.nextFollowUpAt = null;
    }

    const res = await fetch(`/api/customers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "خطا در تغییر مرحله مشتری");

    // ۳) یادداشت در تایم‌لاین فعالیت
    const actDesc =
      payload.stage === "WON"
        ? `موفق${payload.notes ? `: ${payload.notes}` : ""}${payload.propertyId ? " — فایل تگ و بایگانی شد" : ""}`
        : `ناموفق (${payload.lostReasonCategory})${payload.lostReasonDetail ? `: ${payload.lostReasonDetail}` : ""}`;
    await fetch("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "STAGE_CHANGE",
        customerId: id,
        description: actDesc,
        newValue: payload.stage,
      }),
    }).catch(() => {});

    setOutcome(null);
    setOutcomeMsg(payload.stage === "WON" ? "موفق ثبت شد — فایل بایگانی شد" : "ناموفق ثبت شد");
    setTimeout(() => setOutcomeMsg(""), 3500);
    load();
  }

  if (!c) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;

  const overdue = c.nextFollowUpAt && new Date(c.nextFollowUpAt) < new Date() && c.stage !== "LOST" && c.stage !== "WON" && c.stage !== "FAILED";
  const stageColor = CUSTOMER_STAGE_COLORS[c.stage] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <div>
      <Header
        title={c.name}
        subtitle={`${CUSTOMER_TYPE_LABELS[c.type] ?? c.type} — ${CUSTOMER_STAGE_LABELS[c.stage] ?? c.stage}`}
        action={
          <div className="flex gap-2 flex-wrap">
            {c.stage !== "WON" && c.stage !== "FAILED" && c.stage !== "LOST" && <>
              <Button
                variant="outline"
                onClick={() => setOutcome("WON")}
                className="gap-1.5 bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              >
                ✓ موفق
              </Button>
              <Button
                variant="outline"
                onClick={() => setOutcome("FAILED")}
                className="gap-1.5 bg-red-50 border-red-200 text-red-700 hover:bg-red-100"
              >
                ✕ ناموفق
              </Button>
            </>}
            <Button variant="outline" onClick={() => setEditing(!editing)} className="gap-1.5">
              <Pencil className="h-4 w-4" /> {editing ? "انصراف" : "ویرایش"}
            </Button>
            {isOwner && (
              <Button variant="ghost" onClick={handleDelete} className="gap-1.5 text-red-600 hover:bg-red-50">
                <Trash2 className="h-4 w-4" /> حذف
              </Button>
            )}
          </div>
        }
      />

      {error && <div className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {outcomeMsg && <div className="mx-6 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{outcomeMsg}</div>}

      {outcome && (
        <StageOutcomeModal
          kind={outcome}
          customerPhone={c.phone}
          preferredDealType={(c.preferredDealType as string) || null}
          preferredType={(c.preferredType as string) || null}
          onClose={() => setOutcome(null)}
          onSubmit={submitOutcome}
        />
      )}

      {editing && (
        <div className="mx-6 mt-4">
          <Card>
            <h3 className="font-semibold mb-4">ویرایش اطلاعات</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>نام و نام خانوادگی</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label>شماره تماس</Label><PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>نوع</Label><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1"><option value="BUYER">خریدار</option><option value="SELLER">فروشنده</option><option value="TENANT">مستاجر</option><option value="OWNER">مالک</option></Select></div>
              <div><Label>مرحله</Label><Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="mt-1"><option value="INITIAL_CONTACT">تماس اولیه</option><option value="QUALIFIED">ارزیابی‌شده</option><option value="VIEWING">بازدید</option><option value="CONTRACT">قرارداد</option><option value="WON">موفق</option><option value="FAILED">ناموفق</option><option value="LOST">بایگانی</option></Select></div>
              <div><Label>دما</Label><Select value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="mt-1"><option value="HOT">داغ</option><option value="WARM">گرم</option><option value="COLD">سرد</option></Select></div>
              <div><Label>منبع</Label><Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="mt-1"><option value="">—</option><option value="INSTAGRAM">اینستاگرام</option><option value="DIVAR">دیوار</option><option value="DIRECT_CALL">تماس مستقیم</option><option value="REFERRAL">معرفی</option><option value="SIGN_BOARD">تابلو</option><option value="WEBSITE">وب‌سایت</option><option value="OTHER">سایر</option></Select></div>
              <div>
                <Label>نوع معامله موردنظر</Label>
                <Select
                  value={form.preferredDealType}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({
                      ...f,
                      preferredDealType: v,
                      budgetMaxMonthly: v === "SALE" ? "" : f.budgetMaxMonthly,
                    }));
                  }}
                  className="mt-1"
                >
                  <option value="">—</option>
                  <option value="SALE">خرید / فروش</option>
                  <option value="RENT">رهن و اجاره</option>
                </Select>
              </div>
              <div><Label>نوع ملک موردنظر</Label><Select value={form.preferredType} onChange={(e) => setForm({ ...form, preferredType: e.target.value })} className="mt-1"><option value="">—</option>{propertyTypes.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}</Select></div>
              <div className="md:col-span-2"><Label>مناطق موردنظر (چندتایی)</Label><div className="mt-1 flex flex-wrap gap-1.5 mb-2">{form.preferredAreas.map((a: string) => <span key={a} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[12px]">{a}<button type="button" onClick={() => { const arr = form.preferredAreas.filter((x: string) => x !== a); setForm({ ...form, preferredAreas: arr }); }} className="text-[var(--ink-3)] hover:text-red-600">×</button></span>)}<select value="" onChange={(e) => { const v = e.target.value; if (!v) return; const arr = form.preferredAreas; if (!arr.includes(v)) setForm({ ...form, preferredAreas: [...arr, v] }); e.target.value = ""; }} className="rounded-full border border-dashed border-[var(--line-2)] bg-white px-3 py-1 text-[12px]"><option value="">+ افزودن منطقه</option>{regions.filter((r) => !form.preferredAreas.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}</select></div></div>
              <div><Label>تعداد خواب</Label><Input inputMode="numeric" dir="ltr" value={form.preferredBeds} onChange={(e) => setForm({ ...form, preferredBeds: e.target.value.replace(/[^0-9]/g, "") })} placeholder="مثلا ۲" className="mt-1" /></div>
              <div><Label>متراژ از</Label><Input inputMode="numeric" dir="ltr" value={form.preferredSizeMin} onChange={(e) => setForm({ ...form, preferredSizeMin: e.target.value.replace(/[^0-9]/g, "") })} placeholder="80" className="mt-1" /></div>
              <div><Label>متراژ تا</Label><Input inputMode="numeric" dir="ltr" value={form.preferredSizeMax} onChange={(e) => setForm({ ...form, preferredSizeMax: e.target.value.replace(/[^0-9]/g, "") })} placeholder="120" className="mt-1" /></div>

              {form.preferredDealType === "SALE" && (
                <div className="md:col-span-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
                  <div className="mb-2 text-[12px] font-bold text-[var(--ink-2)]">بودجه خرید</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MoneyInput label="بودجه از (تومان)" value={form.budgetMin} onChange={(v) => setForm({ ...form, budgetMin: v })} placeholder="مثلا 2000000000" />
                    <MoneyInput label="سقف قیمت خرید (تومان)" value={form.budgetMax} onChange={(v) => setForm({ ...form, budgetMax: v })} placeholder="مثلا 3500000000" />
                  </div>
                </div>
              )}
              {form.preferredDealType === "RENT" && (
                <div className="md:col-span-2 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
                  <div className="mb-2 text-[12px] font-bold text-[var(--ink-2)]">بودجه رهن و اجاره</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <MoneyInput label="سقف ودیعه / رهن (تومان)" value={form.budgetMax} onChange={(v) => setForm({ ...form, budgetMax: v })} placeholder="مثلا 500000000" />
                    <MoneyInput label="سقف اجاره ماهانه (تومان)" value={form.budgetMaxMonthly} onChange={(v) => setForm({ ...form, budgetMaxMonthly: v })} placeholder="مثلا 15000000" />
                  </div>
                </div>
              )}
              {!form.preferredDealType && (
                <div className="md:col-span-2 rounded-[12px] border border-dashed border-[var(--line-2)] bg-white px-3 py-3 text-[12px] text-[var(--ink-3)]">
                  برای نمایش فیلدهای بودجه، «نوع معامله» را انتخاب کنید.
                </div>
              )}

              <div><Label>پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker value={form.nextFollowUpAt || null} onChange={(v) => setForm({ ...form, nextFollowUpAt: v ?? "" })} /></div></div>
              <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.needsManagerReview === "true"} onChange={(e) => setForm({ ...form, needsManagerReview: e.target.checked ? "true" : "false" })} /><Label>نیاز به بررسی مدیر</Label></div>
              {form.needsManagerReview === "true" && <div className="md:col-span-2"><Label>دلیل بررسی</Label><Textarea value={form.managerReviewReason} onChange={(e) => setForm({ ...form, managerReviewReason: e.target.value })} className="mt-1" /></div>}
              {form.stage === "LOST" && <>
                <div><Label>دلیل از دست رفتن</Label><Select value={form.lostReasonCategory} onChange={(e) => setForm({ ...form, lostReasonCategory: e.target.value })} className="mt-1"><option value="">انتخاب کنید</option><option value="CUSTOMER_WITHDREW">منصرف شد</option><option value="PRICE_REJECTED">قیمت نپذیرفت</option><option value="NO_RESPONSE">پاسخ نمی‌دهد</option><option value="NO_SUITABLE_PROPERTY">فایل مناسب نبود</option><option value="OTHER">سایر</option></Select></div>
                <div><Label>توضیح</Label><Input value={form.lostReasonDetail} onChange={(e) => setForm({ ...form, lostReasonDetail: e.target.value })} className="mt-1" /></div>
              </>}
              <div className="md:col-span-2"><Label>توضیحات</Label><Textarea value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="توضیحات کلی درباره مشتری..." rows={3} className="mt-1" /></div>
              <div className="md:col-span-2"><Label>یادداشت</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} /></div>
            </div>
            <div className="mt-4"><Button onClick={save}>ذخیره</Button></div>
          </Card>
        </div>
      )}

      <div className="p-6 grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        <div className="space-y-4 lg:sticky lg:top-6">
          <Card>
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-700 text-lg font-bold text-white">
                {c.name.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold leading-tight truncate">{c.name}</h2>
                <a href={`tel:${c.phone}`} dir="ltr" className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600 hover:text-red-700">
                  <Phone className="h-4 w-4 shrink-0" /> {c.phone}
                </a>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge className={stageColor}>{CUSTOMER_STAGE_LABELS[c.stage] ?? c.stage}</Badge>
                  <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium">
                    <span className={`h-2 w-2 rounded-full ${TEMPERATURE_COLORS[c.temperature] ?? "bg-zinc-300"}`} />
                    {TEMPERATURE_LABELS[c.temperature] ?? c.temperature}
                  </span>
                  <Badge className="border-zinc-200 bg-white">{CUSTOMER_TYPE_LABELS[c.type] ?? c.type}</Badge>
                  {c.source && <Badge className="border-zinc-200 bg-white">{CUSTOMER_SOURCE_LABELS[c.source] ?? c.source}</Badge>}
                </div>
              </div>
            </div>
            {c.stage === "WON" && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-800">✓ موفق — معامله به سرانجام رسید</div>}
            {c.stage === "FAILED" && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm"><span className="font-medium text-red-800">✕ ناموفق</span>{c.lostReasonDetail ? <span className="text-red-700"> — {c.lostReasonDetail as string}</span> : null}</div>}
            {c.needsManagerReview && (
              <div className="mt-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-medium text-amber-800">نیاز به بررسی مدیر</span>
                  {c.managerReviewReason && <p className="mt-1 text-amber-700">{c.managerReviewReason}</p>}
                </div>
              </div>
            )}
            {c.stage === "LOST" && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm">
                <span className="font-medium text-red-800">بایگانی</span>
                <span className="text-red-700"> — {LOST_REASON_LABELS[c.lostReasonCategory as string] ?? c.lostReasonCategory} {c.lostReasonDetail ? `— ${c.lostReasonDetail as string}` : ""}</span>
              </div>
            )}
          </Card>

          <Card className={overdue ? "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]" : ""}>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Calendar className={`h-4 w-4 ${overdue ? "text-[var(--pomegranate)]" : "text-zinc-500"}`} /> پیگیری
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">
                {followUps.filter((f) => !f.done).length} باز
              </span>
              {overdue && <span className="rounded-full bg-[var(--pomegranate)] px-2 py-0.5 text-[11px] font-bold text-white">عقب‌افتاده</span>}
            </h3>

            {/* Only list — earliest open item is the "next" follow-up (actions live on that row) */}
            {followUps.length === 0 ? (
              <div className="mb-3 rounded-[12px] border border-dashed border-[var(--line-2)] bg-white px-3 py-4 text-center">
                <p className="text-sm text-[var(--ink-3)]">
                  {c.nextFollowUpAt
                    ? `پیگیری بعدی: ${formatDate(c.nextFollowUpAt)} — برای ثبت در لیست، تاریخ را از پایین اضافه کنید`
                    : "هنوز پیگیری ثبت نشده"}
                </p>
              </div>
            ) : (
              <div className="space-y-2 mb-3">
                {followUps.map((f, idx) => {
                  const isOverdue = !f.done && new Date(f.dueAt) < new Date();
                  const isNext = !f.done && idx === followUps.findIndex((x) => !x.done);
                  return (
                    <div
                      key={f.id}
                      className={`rounded-[12px] border px-3 py-2 text-[13px] ${
                        f.done
                          ? "bg-zinc-50 opacity-60 border-[var(--line)]"
                          : isOverdue
                            ? "bg-[var(--pomegranate-soft)] border-[var(--pomegranate-line)]"
                            : isNext
                              ? "bg-white border-[var(--ink)]/20"
                              : "bg-white border-[var(--line)]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={f.done}
                          onChange={async (e) => {
                            await fetch(`/api/follow-ups/${f.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ done: e.target.checked }),
                            });
                            const r = await fetch(`/api/customers/${id}/follow-ups`).then((x) => x.json());
                            setFollowUps(Array.isArray(r) ? r : []);
                            load();
                          }}
                        />
                        <span className={`flex-1 ${f.done ? "line-through text-[var(--ink-3)]" : isOverdue ? "text-[var(--pomegranate)] font-medium" : ""}`}>
                          {formatDate(f.dueAt)}
                          {f.note ? ` — ${f.note}` : ""}
                          {isNext && (
                            <span className="mr-2 rounded-full bg-[var(--ink)] px-2 py-0.5 text-[10px] text-white">بعدی</span>
                          )}
                          {isOverdue && (
                            <span className="mr-2 rounded-full bg-[var(--pomegranate)] px-2 py-0.5 text-[10px] text-white">عقب‌افتاده</span>
                          )}
                        </span>
                        {isOwner && (
                          <button
                            onClick={async () => {
                              const del = await fetch(`/api/follow-ups/${f.id}`, { method: "DELETE" });
                              if (!del.ok) return;
                              const r = await fetch(`/api/customers/${id}/follow-ups`).then((x) => x.json());
                              setFollowUps(Array.isArray(r) ? r : []);
                              load();
                            }}
                            className="text-[11px] text-[var(--ink-3)] hover:text-red-600"
                          >
                            حذف
                          </button>
                        )}
                      </div>

                      {isNext && !f.done && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-2">
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--ink)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-black"
                          >
                            تماس
                          </a>
                          {followUpSaving !== null ? (
                            <>
                              <JalaliDatePicker value={followUpSaving} onChange={(v) => setFollowUpSaving(v)} />
                              <Button
                                size="sm"
                                disabled={!followUpSaving}
                                onClick={async () => {
                                  if (!followUpSaving) return;
                                  await fetch(`/api/follow-ups/${f.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ dueAt: followUpSaving }),
                                  });
                                  setFollowUpSaving(null);
                                  const r = await fetch(`/api/customers/${id}/follow-ups`).then((x) => x.json());
                                  setFollowUps(Array.isArray(r) ? r : []);
                                  load();
                                }}
                              >
                                ذخیره
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setFollowUpSaving(null)}>
                                انصراف
                              </Button>
                            </>
                          ) : (
                            <button
                              onClick={() => setFollowUpSaving(f.dueAt)}
                              className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--paper-2)]"
                            >
                              تغییر تاریخ
                            </button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              await fetch(`/api/follow-ups/${f.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ done: true }),
                              });
                              const r = await fetch(`/api/customers/${id}/follow-ups`).then((x) => x.json());
                              setFollowUps(Array.isArray(r) ? r : []);
                              load();
                            }}
                          >
                            انجام شد
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <JalaliDatePicker value={newFollowUpDate} onChange={setNewFollowUpDate} placeholder="تاریخ پیگیری جدید" />
              </div>
              <Input
                value={newFollowUpNote}
                onChange={(e) => setNewFollowUpNote(e.target.value)}
                placeholder="یادداشت (اختیاری)"
                className="flex-1"
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (!newFollowUpDate) return;
                  await fetch(`/api/customers/${id}/follow-ups`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ dueAt: newFollowUpDate, note: newFollowUpNote || undefined }),
                  });
                  setNewFollowUpDate(null);
                  setNewFollowUpNote("");
                  const r = await fetch(`/api/customers/${id}/follow-ups`).then((x) => x.json());
                  setFollowUps(Array.isArray(r) ? r : []);
                  load();
                }}
                disabled={!newFollowUpDate}
              >
                افزودن
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-[var(--ink-3)]">
              فقط یک لیست پیگیری — ردیف «بعدی» اولین مورد باز است؛ با تیک، خودکار جلو می‌رود.
            </p>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Home className="h-4 w-4 text-zinc-500" /> خواسته‌ها و ترجیحات
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><Wallet className="h-3.5 w-3.5" /> نوع معامله</dt>
                <dd className="font-medium">{c.preferredDealType ? (DEAL_TYPE_LABELS[c.preferredDealType] ?? c.preferredDealType) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><Home className="h-3.5 w-3.5" /> نوع ملک</dt>
                <dd className="font-medium">{c.preferredType ? (PROPERTY_TYPE_LABELS[c.preferredType] ?? c.preferredType) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><MapPin className="h-3.5 w-3.5" /> مناطق</dt>
                <dd className="font-medium flex flex-wrap gap-1 justify-end">{(c.preferredAreas as string[] ?? []).length > 0 ? (c.preferredAreas as string[]).map((a: string) => <span key={a} className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px]">{a}</span>) : (c.preferredArea ? <span>{c.preferredArea}</span> : "—")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><BedDouble className="h-3.5 w-3.5" /> خواب</dt>
                <dd className="font-medium">{c.preferredBeds != null ? `${c.preferredBeds} خواب` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><Ruler className="h-3.5 w-3.5" /> متراژ</dt>
                <dd className="font-medium" dir="ltr">
                  {c.preferredSizeMin != null || c.preferredSizeMax != null
                    ? `${c.preferredSizeMin ?? "—"} – ${c.preferredSizeMax ?? "—"} متر`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-zinc-500"><Wallet className="h-3.5 w-3.5" /> بودجه</dt>
                <dd className="font-medium text-left" dir="ltr">
                  {c.preferredDealType === "RENT" ? (
                    c.budgetMax || (c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly ? (
                      <span className="text-right" dir="rtl">
                        ودیعه {c.budgetMax ? formatToman(c.budgetMax) : "—"}
                        {" · "}
                        اجاره {(c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly ? formatToman((c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly) : "—"}
                      </span>
                    ) : "—"
                  ) : c.budgetMin || c.budgetMax ? (
                    `${c.budgetMin ? formatToman(c.budgetMin) : "—"} تا ${c.budgetMax ? formatToman(c.budgetMax) : "—"}`
                  ) : "—"}
                </dd>
              </div>
            </dl>
          </Card>

          {(c.description as string) && (
            <Card>
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                <StickyNote className="h-4 w-4 text-zinc-500" /> توضیحات
              </h3>
              <p className="text-sm leading-6 text-zinc-700 whitespace-pre-wrap">{c.description as string}</p>
            </Card>
          )}

          {c.notes && (
            <Card>
              <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
                <StickyNote className="h-4 w-4 text-zinc-500" /> یادداشت
              </h3>
              <p className="text-sm leading-6 text-zinc-700 whitespace-pre-wrap">{c.notes}</p>
            </Card>
          )}

          <Card>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-zinc-500 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> مشاور</dt><dd className="font-medium">{c.assignedAgent?.name ?? "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-zinc-500">تاریخ ثبت</dt><dd>{formatDate(c.createdAt)}</dd></div>
            </dl>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> ثبت فعالیت / یادداشت</h3>
            <div className="flex gap-2">
              <Select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="w-36 shrink-0">
                <option value="NOTE">یادداشت</option>
                <option value="CALL">تماس</option>
                <option value="MESSAGE">پیام</option>
                <option value="MEETING">جلسه</option>
                <option value="OTHER">سایر</option>
              </Select>
              <Input
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                placeholder="چی شد؟ چی گفتی؟ نتیجه چی بود..."
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), addActivity())}
                className="flex-1"
              />
              <Button onClick={addActivity} disabled={savingActivity || !activityText.trim()}>ثبت</Button>
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-[14px]">تاریخچه</h3>
              <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{activities.length} مورد</span>
            </div>
            {activities.length === 0 ? (
              <div className="rounded-[14px] border border-dashed border-[var(--line-2)] bg-[var(--paper-2)]/60 px-4 py-8 text-center">
                <p className="text-[13px] font-medium text-[var(--ink-2)]">هنوز چیزی ثبت نشده</p>
                <p className="mt-1 text-[12px] text-[var(--ink-3)]">اولین تماس، بازدید یا یادداشت را بالا اضافه کنید</p>
              </div>
            ) : (
              <div className="relative">
                <div className="absolute right-[11px] top-2 bottom-2 w-px bg-[var(--line)]" />
                <div className="space-y-3">
                  {activities.map((a) => (
                    <div key={a.id} className="relative flex gap-3 pr-1">
                      <span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-white text-[10px] font-bold ${
                        a.type === "STAGE_CHANGE" ? "border-[#F1D9A8] bg-[var(--amber-soft)] text-[var(--amber)]"
                        : a.type === "CALL" ? "border-[#C7D8EE] bg-[#EFF4FF] text-[#2B5AA0]"
                        : a.type === "VIEWING_DONE" ? "border-[#C9D8E8] bg-[#EEF2FF] text-[#3B5B7A]"
                        : "border-[var(--line)] text-[var(--ink-3)]"
                      }`}>
                        {a.type === "CALL" ? "☎" : a.type === "STAGE_CHANGE" ? "⇄" : a.type === "VIEWING_DONE" ? "◉" : "✎"}
                      </span>
                      <div className="flex-1 min-w-0 rounded-[12px] border border-[var(--line)] bg-white px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] font-bold">{ACTIVITY_TYPE_LABELS[a.type] ?? a.type}</span>
                          <span className="text-[11px] text-[var(--ink-3)]">{a.agent?.name}</span>
                          <span className="mr-auto text-[11px] text-[var(--ink-3)]">{formatDate(a.createdAt)}</span>
                        </div>
                        {a.description && <p className="mt-2 text-[13px] leading-6 text-[var(--ink-2)] whitespace-pre-wrap">{a.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
