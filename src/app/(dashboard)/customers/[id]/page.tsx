"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Label, PhoneInput, NumberInput } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDate, formatToman } from "@/lib/utils";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { formatTomanWithWords } from "@/lib/money";
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

type Customer = Record<string, unknown> & {
  id: string; name: string; phone: string; type: string; stage: string; temperature: string;
  source: string | null; notes: string | null;
  preferredType: string | null; preferredDealType: string | null; preferredArea: string | null;
  preferredBeds: number | null; preferredSizeMin: number | null; preferredSizeMax: number | null;
  budgetMin: string | null; budgetMax: string | null;
  nextFollowUpAt: string | null; needsManagerReview: boolean; managerReviewReason: string | null;
  lostReasonCategory: string | null; lostReasonDetail: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: string;
};

type Activity = { id: string; type: string; description: string | null; createdAt: string; agent: { name: string } };

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [c, setC] = useState<Customer | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState("NOTE");
  const [savingActivity, setSavingActivity] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState<string | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);

  function load() {
    fetch(`/api/customers/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.id) {
          setC(d);
          setForm({
            name: d.name ?? "", phone: d.phone ?? "", notes: d.notes ?? "",
            nextFollowUpAt: d.nextFollowUpAt ? new Date(d.nextFollowUpAt).toISOString().slice(0, 16) : "",
            stage: d.stage ?? "", temperature: d.temperature ?? "",
            type: d.type ?? "", source: d.source ?? "",
            preferredType: d.preferredType ?? "", preferredDealType: d.preferredDealType ?? "",
            preferredArea: d.preferredArea ?? "", preferredBeds: d.preferredBeds != null ? String(d.preferredBeds) : "",
            preferredSizeMin: d.preferredSizeMin != null ? String(d.preferredSizeMin) : "",
            preferredSizeMax: d.preferredSizeMax != null ? String(d.preferredSizeMax) : "",
            budgetMin: d.budgetMin ?? "", budgetMax: d.budgetMax ?? "",
            lostReasonCategory: d.lostReasonCategory ?? "", lostReasonDetail: d.lostReasonDetail ?? "",
            needsManagerReview: d.needsManagerReview ? "true" : "false",
            managerReviewReason: d.managerReviewReason ?? "",
          });
        }
      });
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
      name: form.name, phone: form.phone, notes: form.notes || null,
      stage: form.stage, temperature: form.temperature, type: form.type,
      source: form.source || null,
      preferredType: form.preferredType || null,
      preferredDealType: form.preferredDealType || null,
      preferredArea: form.preferredArea || null,
      preferredBeds: form.preferredBeds ? parseInt(form.preferredBeds) : null,
      preferredSizeMin: form.preferredSizeMin ? parseFloat(form.preferredSizeMin) : null,
      preferredSizeMax: form.preferredSizeMax ? parseFloat(form.preferredSizeMax) : null,
      budgetMin: form.budgetMin || null, budgetMax: form.budgetMax || null,
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
    if (!confirm("حذف مشتری؟")) return;
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
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

  if (!c) return <div className="p-8 text-center text-zinc-400">بارگذاری...</div>;

  const overdue = c.nextFollowUpAt && new Date(c.nextFollowUpAt) < new Date() && c.stage !== "LOST";
  const stageColor = CUSTOMER_STAGE_COLORS[c.stage] ?? "bg-zinc-100 text-zinc-700 border-zinc-200";

  return (
    <div>
      <Header
        title={c.name}
        subtitle={`${CUSTOMER_TYPE_LABELS[c.type] ?? c.type} — ${CUSTOMER_STAGE_LABELS[c.stage] ?? c.stage}`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(!editing)} className="gap-1.5">
              <Pencil className="h-4 w-4" /> {editing ? "انصراف" : "ویرایش"}
            </Button>
            <Button variant="ghost" onClick={handleDelete} className="gap-1.5 text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" /> حذف
            </Button>
          </div>
        }
      />

      {error && <div className="mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {/* Edit form — full width when open */}
      {editing && (
        <div className="mx-6 mt-4">
          <Card>
            <h3 className="font-semibold mb-4">ویرایش اطلاعات</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label>نام و نام خانوادگی</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label>شماره تماس</Label><PhoneInput value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1" /></div>
              <div><Label>نوع</Label><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1"><option value="BUYER">خریدار</option><option value="SELLER">فروشنده</option><option value="TENANT">مستاجر</option><option value="OWNER">مالک</option></Select></div>
              <div><Label>مرحله</Label><Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="mt-1"><option value="INITIAL_CONTACT">تماس اولیه</option><option value="QUALIFIED">ارزیابی‌شده</option><option value="VIEWING">بازدید</option><option value="CONTRACT">قرارداد</option><option value="LOST">از دست رفته</option></Select></div>
              <div><Label>دما</Label><Select value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="mt-1"><option value="HOT">داغ</option><option value="WARM">گرم</option><option value="COLD">سرد</option></Select></div>
              <div><Label>منبع</Label><Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="mt-1"><option value="">—</option><option value="INSTAGRAM">اینستاگرام</option><option value="DIVAR">دیوار</option><option value="DIRECT_CALL">تماس مستقیم</option><option value="REFERRAL">معرفی</option><option value="SIGN_BOARD">تابلو</option><option value="WEBSITE">وب‌سایت</option><option value="OTHER">سایر</option></Select></div>
              <div><Label>نوع معامله موردنظر</Label><Select value={form.preferredDealType} onChange={(e) => setForm({ ...form, preferredDealType: e.target.value })} className="mt-1"><option value="">—</option><option value="SALE">خرید / فروش</option><option value="RENT">رهن و اجاره</option></Select></div>
              <div><Label>نوع ملک موردنظر</Label><Select value={form.preferredType} onChange={(e) => setForm({ ...form, preferredType: e.target.value })} className="mt-1"><option value="">—</option>{propertyTypes.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}</Select></div>
              <div><Label>منطقه موردنظر</Label><Select value={form.preferredArea} onChange={(e) => setForm({ ...form, preferredArea: e.target.value })} className="mt-1"><option value="">—</option>{regions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></div>
              <div><Label>تعداد خواب</Label><NumberInput value={form.preferredBeds} onChange={(e) => setForm({ ...form, preferredBeds: e.target.value })} placeholder="مثلا ۲" className="mt-1" /></div>
              <div><Label>متراژ از</Label><NumberInput value={form.preferredSizeMin} onChange={(e) => setForm({ ...form, preferredSizeMin: e.target.value })} placeholder="80" className="mt-1" /></div>
              <div><Label>متراژ تا</Label><NumberInput value={form.preferredSizeMax} onChange={(e) => setForm({ ...form, preferredSizeMax: e.target.value })} placeholder="120" className="mt-1" /></div>
              <div><Label>بودجه از (تومان)</Label><NumberInput value={form.budgetMin} onChange={(e) => setForm({ ...form, budgetMin: e.target.value })} className="mt-1" />{form.budgetMin ? <p className="mt-1 text-xs text-zinc-500">{formatTomanWithWords(form.budgetMin).words}</p> : null}</div>
              <div><Label>بودجه تا (تومان)</Label><NumberInput value={form.budgetMax} onChange={(e) => setForm({ ...form, budgetMax: e.target.value })} className="mt-1" />{form.budgetMax ? <p className="mt-1 text-xs text-zinc-500">{formatTomanWithWords(form.budgetMax).words}</p> : null}</div>
              <div><Label>پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker value={form.nextFollowUpAt || null} onChange={(v) => setForm({ ...form, nextFollowUpAt: v ?? "" })} /></div></div>
              <div className="flex items-center gap-2 pt-6"><input type="checkbox" checked={form.needsManagerReview === "true"} onChange={(e) => setForm({ ...form, needsManagerReview: e.target.checked ? "true" : "false" })} /><Label>نیاز به بررسی مدیر</Label></div>
              {form.needsManagerReview === "true" && <div className="md:col-span-2"><Label>دلیل بررسی</Label><Textarea value={form.managerReviewReason} onChange={(e) => setForm({ ...form, managerReviewReason: e.target.value })} className="mt-1" /></div>}
              {form.stage === "LOST" && <>
                <div><Label>دلیل از دست رفتن</Label><Select value={form.lostReasonCategory} onChange={(e) => setForm({ ...form, lostReasonCategory: e.target.value })} className="mt-1"><option value="">انتخاب کنید</option><option value="CUSTOMER_WITHDREW">منصرف شد</option><option value="PRICE_REJECTED">قیمت نپذیرفت</option><option value="NO_RESPONSE">پاسخ نمی‌دهد</option><option value="NO_SUITABLE_PROPERTY">فایل مناسب نبود</option><option value="OTHER">سایر</option></Select></div>
                <div><Label>توضیح</Label><Input value={form.lostReasonDetail} onChange={(e) => setForm({ ...form, lostReasonDetail: e.target.value })} className="mt-1" /></div>
              </>}
              <div className="md:col-span-2"><Label>یادداشت</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} /></div>
            </div>
            <div className="mt-4"><Button onClick={save}>ذخیره</Button></div>
          </Card>
        </div>
      )}

      {/* Two-column layout */}
      <div className="p-6 grid gap-6 lg:grid-cols-[380px_1fr] items-start">
        {/* Right — Profile */}
        <div className="space-y-4 lg:sticky lg:top-6">
          {/* Name + stage card */}
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
                <span className="font-medium text-red-800">از دست رفته</span>
                <span className="text-red-700"> — {LOST_REASON_LABELS[c.lostReasonCategory as string] ?? c.lostReasonCategory} {c.lostReasonDetail ? `— ${c.lostReasonDetail}` : ""}</span>
              </div>
            )}
          </Card>

          {/* Follow-up — دیدار-style: prominent, actionable */}
          <Card className={overdue ? "border-[var(--pomegranate-line)] bg-[var(--pomegranate-soft)]" : ""}>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
              <Calendar className={`h-4 w-4 ${overdue ? "text-[var(--pomegranate)]" : "text-zinc-500"}`} /> پیگیری بعدی
              {overdue && <span className="rounded-full bg-[var(--pomegranate)] px-2 py-0.5 text-[11px] font-bold text-white">عقب‌افتاده</span>}
            </h3>
            {followUpSaving !== null ? (
              <div className="rounded-[12px] border border-[var(--line)] bg-white p-3">
                <JalaliDatePicker value={followUpSaving} onChange={(v) => setFollowUpSaving(v)} />
                <div className="mt-2 flex gap-2">
                  <Button size="sm" disabled={!followUpSaving} onClick={async () => {
                    if (!followUpSaving) return;
                    const res = await fetch(`/api/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nextFollowUpAt: followUpSaving }) });
                    if (res.ok) { setFollowUpSaving(null); load(); }
                  }}>ذخیره</Button>
                  <Button variant="ghost" size="sm" onClick={() => setFollowUpSaving(null)}>انصراف</Button>
                </div>
              </div>
            ) : c.nextFollowUpAt ? (
              <div className={`rounded-[12px] border px-3 py-3 text-sm ${overdue ? "border-[var(--pomegranate-line)] bg-white text-[var(--pomegranate)]" : "border-[var(--line)] bg-[var(--paper-2)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{formatDate(c.nextFollowUpAt)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${overdue ? "bg-[var(--pomegranate)] text-white" : "bg-white border border-[var(--line)]"}`}>{overdue ? "نیاز به تماس" : "در نوبت"}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 rounded-[10px] bg-[var(--ink)] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-black">تماس</a>
                  <button onClick={() => setFollowUpSaving(c.nextFollowUpAt)} className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--paper-2)]">تغییر تاریخ</button>
                </div>
              </div>
            ) : (
              <div className="rounded-[12px] border border-dashed border-[var(--line-2)] bg-white px-3 py-4 text-center">
                <p className="text-sm text-[var(--ink-3)]">تاریخ پیگیری تعیین نشده</p>
                <button onClick={() => setFollowUpSaving(new Date().toISOString())} className="mt-2 text-[12px] font-medium text-[var(--pomegranate)] hover:underline">تعیین تاریخ پیگیری</button>
              </div>
            )}
          </Card>

          {/* Preferences */}
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
                <dt className="flex items-center gap-1.5 text-zinc-500"><MapPin className="h-3.5 w-3.5" /> منطقه</dt>
                <dd className="font-medium">{c.preferredArea ?? "—"}</dd>
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
                  {c.budgetMin || c.budgetMax
                    ? `${c.budgetMin ? formatToman(c.budgetMin) : "—"} تا ${c.budgetMax ? formatToman(c.budgetMax) : "—"}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>

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

        {/* Left — Timeline / Activities */}
        <div className="space-y-4 min-w-0">
          {/* Add activity */}
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

          {/* Timeline — دیدار-style: compact, date-grouped */}
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
