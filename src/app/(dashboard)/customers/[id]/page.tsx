"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Label, PhoneInput } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import dynamic from "next/dynamic";
import { formatDate, toFaDigits } from "@/lib/utils";
import { MoneyText } from "@/components/ui/MoneyText";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { SearchSelect, type SearchOption } from "@/components/ui/SearchSelect";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";

// نقد ۹ — مودال و انتخابگر تاریخ با next/dynamic تنبل بارگذاری می‌شوند
const JalaliDatePicker = dynamic(
  () => import("@/components/ui/JalaliDatePicker").then((m) => m.JalaliDatePicker),
  { ssr: false, loading: () => <div className="h-10 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] animate-pulse" /> }
);
const StageOutcomeModal = dynamic(
  () => import("@/components/customers/StageOutcomeModal").then((m) => m.StageOutcomeModal),
  { ssr: false }
);
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
import type { OutcomeKind } from "@/components/customers/StageOutcomeModal";
import { useRole } from "@/hooks/useRole";

/** تاریخ ISO برای N روز بعد — همان فرمتی که JalaliDatePicker برمی‌گرداند */
function isoInDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

/** ثبت سریع نتیجه تماس: برچسب فعالیت، روزهای تا پیگیری بعدی، مرحله جدید (در صورت نیاز) */
const QUICK_CALLS = [
  { key: "answered", label: "جواب داد", days: 1, desc: "تماس: جواب داد", stage: null as string | null },
  { key: "noanswer", label: "جواب نداد", days: 2, desc: "تماس: جواب نداد", stage: null as string | null },
  { key: "viewing", label: "قرار بازدید گذاشت", days: 1, desc: "تماس: قرار بازدید گذاشته شد", stage: "VIEWING" as string | null },
  { key: "callback", label: "گفت خودش زنگ می‌زند", days: 3, desc: "تماس: گفت خودش زنگ می‌زند", stage: null as string | null },
];

type Customer = Record<string, unknown> & {
  id: string; name: string; phone: string; type: string; stage: string; temperature: string;
  source: string | null; notes: string | null;
  preferredType: string | null; preferredDealType: string | null; preferredArea: string | null; preferredAreas: string[]; description: string | null; tags: string[];
  preferredBeds: number | null; preferredSizeMin: number | null; preferredSizeMax: number | null;
  budgetMin: string | null; budgetMax: string | null;
  nextFollowUpAt: string | null; needsManagerReview: boolean; managerReviewReason: string | null;
  lostReasonCategory: string | null; lostReasonDetail: string | null;
  assignedAgent: { id: string; name: string } | null;
  createdAt: string;
  transfers?: TransferHistory[];
};

type TransferHistory = {
  id: string; createdAt: string;
  fromAgent: { id: string; name: string; active: boolean } | null;
  toAgent: { id: string; name: string; active: boolean } | null;
  byUser: { id: string; name: string } | null;
};

type Activity = { id: string; type: string; description: string | null; createdAt: string; agent: { name: string } };
type FollowUp = { id: string; dueAt: string; note: string | null; done: boolean };

type Viewing = {
  id: string;
  startAt: string;
  endAt?: string | null;
  status: string;
  feedback?: string | null;
  property?: { id: string; title: string; code?: string | null } | null;
  agent?: { id: string; name: string } | null;
};

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
  tags: string[];
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
    preferredAreas: [], tags: [], preferredBeds: "", preferredSizeMin: "", preferredSizeMax: "",
    budgetMin: "", budgetMax: "", budgetMaxMonthly: "", lostReasonCategory: "", lostReasonDetail: "",
    needsManagerReview: "false", managerReviewReason: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activityText, setActivityText] = useState("");
  const [activityType, setActivityType] = useState("NOTE");
  const [savingActivity, setSavingActivity] = useState(false);
  const [followUpSaving, setFollowUpSaving] = useState<string | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [newFollowUpDate, setNewFollowUpDate] = useState<string | null>(null);
  const [newFollowUpNote, setNewFollowUpNote] = useState("");
  const [regions, setRegions] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<{ value: string; label: string }[]>([]);
  const [customerTags, setCustomerTags] = useState<string[]>([]);
  const [dup, setDup] = useState<{ id: string; name: string } | null>(null);
  const [outcome, setOutcome] = useState<OutcomeKind | null>(null);
  const [outcomeMsg, setOutcomeMsg] = useState("");
  const [nextPrompt, setNextPrompt] = useState<{ type: string; date: string | null; note: string } | null>(null);
  const [nextSaving, setNextSaving] = useState(false);
  const [quickSaving, setQuickSaving] = useState<string | null>(null);
  const [agents, setAgents] = useState<{ id: string; name: string; role: string; active?: boolean }[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [transferOk, setTransferOk] = useState("");
  const [viewings, setViewings] = useState<Viewing[]>([]);

  // ثبت بازدید با فایل — مثل فرم بازدید صفحه فایل، با این تفاوت که مشتری ثابت است
  const [visProperty, setVisProperty] = useState("");
  const [visDate, setVisDate] = useState<string | null>(null);
  const [visFeedback, setVisFeedback] = useState("");
  const [visAgent, setVisAgent] = useState("");
  const [visStatus, setVisStatus] = useState("SCHEDULED");
  const [savingVis, setSavingVis] = useState(false);
  const [visPropertyOptions, setVisPropertyOptions] = useState<SearchOption[]>([]);
  const [visPropertyTotal, setVisPropertyTotal] = useState<number | null>(null);
  const [visPropSearch, setVisPropSearch] = useState("");
  const [visPropDealType, setVisPropDealType] = useState("");
  const [visPropAdvisorId, setVisPropAdvisorId] = useState("");
  const [visPropPriceMin, setVisPropPriceMin] = useState("");
  const [visPropPriceMax, setVisPropPriceMax] = useState("");
  const [visPropRentMin, setVisPropRentMin] = useState("");
  const [visPropRentMax, setVisPropRentMax] = useState("");
  const visPropertyIdRef = useRef("");

  // نقد ۱ — بارگذاری با کمک‌کنندهٔ مرکزی؛ خطا پیام + تلاش دوباره دارد
  // و صفحه دیگر روی «بارگذاری...» گیر نمی‌کند.
  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [d, fus, acts, vis] = await Promise.all([
        apiJson<Customer>(`/api/customers/${id}`),
        apiJson<FollowUp[]>(`/api/customers/${id}/follow-ups`),
        apiJson<{ activities?: Activity[] } | Activity[]>(`/api/activities?customerId=${id}`),
        apiJson<Viewing[]>(`/api/viewings?customerId=${id}`),
      ]);
      if (d.id) {
        setC(d);
        setForm({
          name: d.name ?? "", phone: d.phone ?? "", notes: d.notes ?? "", description: d.description ?? "",
          nextFollowUpAt: d.nextFollowUpAt ?? "",
          stage: d.stage ?? "", temperature: d.temperature ?? "",
          type: d.type ?? "", source: d.source ?? "",
          preferredType: d.preferredType ?? "", preferredDealType: d.preferredDealType ?? "",
          preferredArea: d.preferredArea ?? "", preferredAreas: d.preferredAreas ?? [], tags: d.tags ?? [],
          preferredBeds: d.preferredBeds != null ? String(d.preferredBeds) : "",
          preferredSizeMin: d.preferredSizeMin != null ? String(d.preferredSizeMin) : "",
          preferredSizeMax: d.preferredSizeMax != null ? String(d.preferredSizeMax) : "",
          budgetMin: d.budgetMin ?? "", budgetMax: d.budgetMax ?? "",
          budgetMaxMonthly: (d.budgetMaxMonthly as string | null | undefined) ?? "",
          lostReasonCategory: d.lostReasonCategory ?? "", lostReasonDetail: d.lostReasonDetail ?? "",
          needsManagerReview: d.needsManagerReview ? "true" : "false",
          managerReviewReason: d.managerReviewReason ?? "",
        });
      }
      setFollowUps(Array.isArray(fus) ? fus : []);
      setViewings(Array.isArray(vis) ? vis : []);
      const list = Array.isArray(acts) ? acts : (Array.isArray(acts.activities) ? acts.activities : []);
      setActivities(list);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // جستجوی فایل — سمت سرور (عنوان/کد + نوع معامله + مشاور)، مثل فرم کارت جلسه
  const loadPropertyOptions = useCallback(async () => {
    const params = new URLSearchParams({ limit: "100" });
    if (visPropSearch.trim()) params.set("search", visPropSearch.trim());
    if (visPropDealType) params.set("dealType", visPropDealType);
    if (visPropAdvisorId) params.set("listedById", visPropAdvisorId);
    if (visPropPriceMin) params.set("priceMin", visPropPriceMin);
    if (visPropPriceMax) params.set("priceMax", visPropPriceMax);
    if (visPropRentMin) params.set("rentMin", visPropRentMin);
    if (visPropRentMax) params.set("rentMax", visPropRentMax);
    try {
      const d = await apiJson<{ properties?: { id: string; title: string; code?: string | null }[]; total?: number } | { id: string; title: string; code?: string | null }[]>(`/api/properties?${params.toString()}`);
      const list = (Array.isArray(d) ? d : d.properties ?? []) as { id: string; title: string; code?: string | null }[];
      setVisPropertyTotal(Array.isArray(d) ? list.length : d.total ?? list.length);
      const opts = list.map((x) => ({ id: x.id, label: x.code ? `${x.code} — ${x.title}` : x.title }));
      // فایل انتخابی را نگه دار — حتی اگر با فیلتر تازه در لیست نباشد، برچسبش ناپدید نشود
      setVisPropertyOptions((prev) => {
        const selId = visPropertyIdRef.current;
        if (!selId) return opts;
        const sel = prev.find((o) => o.id === selId);
        if (sel && !opts.some((o) => o.id === sel.id)) return [...opts, sel];
        return opts;
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [visPropSearch, visPropDealType, visPropAdvisorId, visPropPriceMin, visPropPriceMax, visPropRentMin, visPropRentMax]);

  useEffect(() => {
    visPropertyIdRef.current = visProperty;
  }, [visProperty]);

  useEffect(() => {
    const t = setTimeout(() => {
      loadPropertyOptions();
    }, visPropSearch.trim() || visPropPriceMin || visPropPriceMax || visPropRentMin || visPropRentMax ? 280 : 0);
    return () => clearTimeout(t);
  }, [visPropSearch, visPropDealType, visPropAdvisorId, visPropPriceMin, visPropPriceMax, visPropRentMin, visPropRentMax, loadPropertyOptions]);

  async function refreshFollowUps() {
    const r = await apiJson<FollowUp[]>(`/api/customers/${id}/follow-ups`);
    setFollowUps(Array.isArray(r) ? r : []);
  }

  useEffect(() => {
    // بارگذاری اولیهٔ داده — الگوی استاندارد صفحه‌های کلاینتی
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    apiJson<{ regions?: string[]; propertyTypes?: { value: string; label: string }[]; customerTags?: string[] }>("/api/settings")
      .then((d) => { if (d.regions) setRegions(d.regions); if (d.propertyTypes) setPropertyTypes(d.propertyTypes); if (d.customerTags) setCustomerTags(d.customerTags); })
      .catch(() => {});
    apiJson<{ id: string; name: string; role: string; active?: boolean }[]>("/api/users")
      .then((d) => { if (Array.isArray(d)) setAgents(d.filter((u) => u.active !== false)); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // هشدار شماره تکراری در ویرایش — فقط وقتی شماره عوض شده و کامل است
  useEffect(() => {
    if (!editing || !c) return;
    const phone = form.phone.trim();
    if (!/^[0-9]{10,15}$/.test(phone) || phone === c.phone) return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiJson<{ customers?: { id: string; name: string; phone: string }[] }>(`/api/customers?search=${encodeURIComponent(phone)}&limit=100&category=${form.type === "OWNER" ? "owners" : "customers"}`)
        .then((d) => {
          if (cancelled) return;
          const list = Array.isArray(d) ? d : (d.customers ?? []);
          const hit = list.find((x) => x.phone === phone && x.id !== id);
          setDup(hit ? { id: hit.id, name: hit.name } : null);
        })
        .catch(() => {});
    }, 300);
    return () => { cancelled = true; clearTimeout(t); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.phone, form.type, editing]);

  async function save() {
    setError("");
    if (dup && !confirm(`این شماره قبلاً برای «${dup.name}» ثبت شده است. باز هم ذخیره کنم؟`)) return;
    const body: Record<string, unknown> = {
      name: form.name, phone: form.phone, notes: form.notes || null, description: form.description || null,
      stage: form.stage, temperature: form.temperature, type: form.type,
      source: form.source || null,
      preferredType: form.preferredType || null,
      preferredDealType: form.preferredDealType || null,
      preferredArea: form.preferredArea || null, preferredAreas: form.preferredAreas ?? [], tags: form.tags ?? [],
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
    try {
      await apiFetch(`/api/customers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { setError(errorMessage(e)); return; }
    setEditing(false); load();
  }

  async function handleDelete() {
    if (!confirm("حذف مشتری؟ این کار برگشت‌پذیر نیست.")) return;
    try {
      await apiFetch(`/api/customers/${id}`, { method: "DELETE" });
    } catch (e) {
      setError(errorMessage(e));
      return;
    }
    router.push("/customers");
  }

  async function transferCustomer() {
    if (!transferTo || !c) return;
    const target = agents.find((a) => a.id === transferTo);
    if (!target) return;
    if (!confirm(`مشتری «${c.name}» به ${target.name} منتقل شود؟`)) return;
    setTransferring(true);
    setTransferOk("");
    setError("");
    try {
      await apiFetch(`/api/customers/${id}/transfer`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toAgentId: transferTo }) });
      setTransferOk(`مشتری به ${target.name} منتقل شد.`);
      setTransferTo("");
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setTransferring(false);
    }
  }

  async function revertTransfer() {
    if (!c || !c.transfers?.[0]?.fromAgent) return;
    const prev = c.transfers[0].fromAgent;
    if (!confirm(`مشتری «${c.name}» به ${prev.name} برگردانده شود؟`)) return;
    setReverting(true);
    setTransferOk("");
    setError("");
    try {
      await apiFetch(`/api/customers/${id}/transfer/revert`, { method: "POST" });
      setTransferOk(`مشتری به ${prev.name} برگردانده شد.`);
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setReverting(false);
    }
  }

  async function addActivity() {
    if (!activityText.trim()) return;
    setSavingActivity(true);
    try {
      await apiFetch("/api/activities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: activityType, customerId: id, description: activityText }),
      });
      setActivityText("");
      load();
      // قدم بعدی را همان‌جا بپرس — مشتری بدون «فعالیت بعدی» نماند
      setNextPrompt({ type: "CALL", date: isoInDays(1), note: "" });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingActivity(false);
    }
  }

  async function addViewing() {
    if (!visProperty || !visDate) {
      setError("فایل و تاریخ بازدید الزامی است");
      return;
    }
    setSavingVis(true);
    const body: Record<string, unknown> = {
      customerId: id,
      propertyId: visProperty,
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
      setError(errorMessage(e));
      return;
    }
    setSavingVis(false);
    setVisFeedback("");
    setOutcomeMsg("بازدید ثبت شد");
    setTimeout(() => setOutcomeMsg(""), 3500);
    load();
  }

  async function quickCall(q: (typeof QUICK_CALLS)[number]) {
    if (quickSaving) return;
    setQuickSaving(q.key);
    setError("");
    try {
      await apiFetch("/api/activities", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "CALL", customerId: id, description: q.desc }),
      });
      const body: Record<string, unknown> = { nextFollowUpAt: isoInDays(q.days) };
      if (q.stage) body.stage = q.stage;
      await apiFetch(`/api/customers/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setQuickSaving(null);
    }
  }

  async function submitOutcome(payload: {
    stage: OutcomeKind;
    notes?: string | null;
    lostReasonCategory?: string;
    lostReasonDetail?: string | null;
    propertyId?: string | null;
  }) {
    // ۱) اگر موفق و فایل انتخاب شده: معامله قطعی → فایل SOLD/RENTED و مشتری WON (فقط از مسیر معامله)
    if (payload.stage === "WON" && payload.propertyId) {
      try {
        await apiFetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            customerId: id,
            propertyId: payload.propertyId,
            status: "COMPLETED",
            notes: payload.notes || "موفق — از پروفایل مشتری ثبت شد",
          }),
        });
      } catch (e) {
        throw new Error(errorMessage(e));
      }
    }

    // ۲) یادداشت/دلیل مشتری — مرحله مستقیم عوض نمی‌شود؛ WON از مسیر معامله می‌آید
    const body: Record<string, unknown> = {};
    if (payload.stage === "WON") {
      body.notes = payload.notes || null;
      body.nextFollowUpAt = null;
    } else {
      body.stage = payload.stage;
      body.lostReasonCategory = payload.lostReasonCategory || "OTHER";
      body.lostReasonDetail = payload.lostReasonDetail || null;
      body.nextFollowUpAt = null;
    }

    try {
      await apiFetch(`/api/customers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error(errorMessage(e));
    }

    // ۳) یادداشت در تایم‌لاین فعالیت
    const actDesc =
      payload.stage === "WON"
        ? `موفق${payload.notes ? `: ${payload.notes}` : ""}${payload.propertyId ? " — فایل تگ و بایگانی شد" : ""}`
        : `ناموفق (${payload.lostReasonCategory})${payload.lostReasonDetail ? `: ${payload.lostReasonDetail}` : ""}`;
    try {
      await apiFetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "STAGE_CHANGE",
          customerId: id,
          description: actDesc,
          newValue: payload.stage,
        }),
      });
    } catch (e) {
      console.error("[activity] stage-change activity failed:", errorMessage(e));
    }

    setOutcome(null);
    setOutcomeMsg(payload.stage === "WON" ? "موفق ثبت شد — فایل بایگانی شد" : "ناموفق ثبت شد");
    setTimeout(() => setOutcomeMsg(""), 3500);
    load();
  }

  if (loading && !c) return <PageSkeleton rows={4} />;
  if (loadError && !c) return <PageError message={loadError} onRetry={load} />;
  if (!c) return <PageSkeleton rows={4} />;

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
            <Button variant="outline" onClick={() => { setEditing(!editing); setDup(null); }} className="gap-1.5">
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

      {error && <div className="mx-4 sm:mx-6 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {outcomeMsg && <div className="mx-4 sm:mx-6 mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{outcomeMsg}</div>}

      {outcome && (
        <StageOutcomeModal
          kind={outcome}
          preferredDealType={(c.preferredDealType as string) || null}
          preferredType={(c.preferredType as string) || null}
          onClose={() => setOutcome(null)}
          onSubmit={submitOutcome}
        />
      )}

      {editing && (
        <div className="mx-4 sm:mx-6 mt-4">
          <Card>
            <h3 className="font-semibold mb-4">ویرایش اطلاعات</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div><Label htmlFor="f-name">نام و نام خانوادگی</Label><Input id="f-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="f-phone">شماره تماس</Label><PhoneInput id="f-phone" value={form.phone} onChange={(e) => { setForm({ ...form, phone: e.target.value }); setDup(null); }} className="mt-1" />
                {dup && (
                  <div className="mt-2 rounded-[10px] border border-amber-300 bg-amber-50 px-2.5 py-2 text-[12px] text-amber-800">
                    ⚠️ این شماره قبلاً برای «{dup.name}» ثبت شده است.
                  </div>
                )}
              </div>
              <div><Label htmlFor="f-type">نوع</Label><Select id="f-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="mt-1"><option value="BUYER">خریدار</option><option value="SELLER">فروشنده</option><option value="TENANT">مستاجر</option><option value="OWNER">مالک</option></Select></div>
              <div><Label htmlFor="f-stage">مرحله</Label><Select id="f-stage" value={form.stage === "NEW" ? "INITIAL_CONTACT" : form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className="mt-1"><option value="INITIAL_CONTACT">تماس اولیه</option><option value="VIEWING">بازدید</option><option value="QUALIFIED">مذاکره</option><option value="CONTRACT">قرارداد</option>{form.stage === "WON" && <option value="WON">موفق</option>}<option value="FAILED">ناموفق</option><option value="LOST">بایگانی</option></Select></div>
              <div><Label htmlFor="f-temperature">دما</Label><Select id="f-temperature" value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} className="mt-1"><option value="HOT">داغ</option><option value="WARM">گرم</option><option value="COLD">سرد</option></Select></div>
              <div><Label htmlFor="f-source">منبع</Label><Select id="f-source" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className="mt-1"><option value="">—</option><option value="INSTAGRAM">اینستاگرام</option><option value="DIVAR">دیوار</option><option value="DIRECT_CALL">تماس مستقیم</option><option value="REFERRAL">معرفی</option><option value="SIGN_BOARD">تابلو</option><option value="WEBSITE">وب‌سایت</option><option value="IN_PERSON">حضوری</option><option value="ADVERTISEMENT">آگهی</option><option value="FILE_FINDING">فایل‌یابی</option><option value="OTHER">سایر</option></Select></div>
              <div className="md:col-span-2">
                <Label>برچسب‌ها</Label>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {form.tags.map((t: string) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[12px]">
                      {t}
                      <button type="button" onClick={() => setForm({ ...form, tags: form.tags.filter((x: string) => x !== t) })} className="text-[var(--ink-3)] hover:text-red-600">×</button>
                    </span>
                  ))}
                  <select value="" onChange={(e) => { const v = e.target.value; if (!v) return; if (!form.tags.includes(v)) setForm({ ...form, tags: [...form.tags, v] }); e.target.value = ""; }} className="rounded-full border border-dashed border-[var(--line-2)] bg-white px-3 py-1 text-[12px]" aria-label="افزودن برچسب">
                    <option value="">+ افزودن برچسب</option>
                    {customerTags.filter((t) => !form.tags.includes(t)).map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <Label htmlFor="f-preferredDealType">نوع معامله موردنظر</Label>
                <Select id="f-preferredDealType"
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
              <div><Label htmlFor="f-preferredType">نوع ملک موردنظر</Label><Select id="f-preferredType" value={form.preferredType} onChange={(e) => setForm({ ...form, preferredType: e.target.value })} className="mt-1"><option value="">—</option>{propertyTypes.map((pt) => <option key={pt.value} value={pt.value}>{pt.label}</option>)}</Select></div>
              <div className="md:col-span-2"><Label htmlFor="f-addRegion">مناطق موردنظر (چندتایی)</Label><div className="mt-1 flex flex-wrap gap-1.5 mb-2">{form.preferredAreas.map((a: string) => <span key={a} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2.5 py-1 text-[12px]">{a}<button type="button" onClick={() => { const arr = form.preferredAreas.filter((x: string) => x !== a); setForm({ ...form, preferredAreas: arr }); }} className="text-[var(--ink-3)] hover:text-red-600">×</button></span>)}<select id="f-addRegion" value="" onChange={(e) => { const v = e.target.value; if (!v) return; const arr = form.preferredAreas; if (!arr.includes(v)) setForm({ ...form, preferredAreas: [...arr, v] }); e.target.value = ""; }} className="rounded-full border border-dashed border-[var(--line-2)] bg-white px-3 py-1 text-[12px]"><option value="">+ افزودن منطقه</option>{regions.filter((r) => !form.preferredAreas.includes(r)).map((r) => <option key={r} value={r}>{r}</option>)}</select></div></div>
              <div><Label htmlFor="f-preferredBeds">تعداد خواب</Label><Input id="f-preferredBeds" inputMode="numeric" dir="ltr" value={form.preferredBeds} onChange={(e) => setForm({ ...form, preferredBeds: e.target.value.replace(/[^0-9]/g, "") })} placeholder="مثلا ۲" className="mt-1" /></div>
              <div><Label htmlFor="f-preferredSizeMin">متراژ از</Label><Input id="f-preferredSizeMin" inputMode="numeric" dir="ltr" value={form.preferredSizeMin} onChange={(e) => setForm({ ...form, preferredSizeMin: e.target.value.replace(/[^0-9]/g, "") })} placeholder="80" className="mt-1" /></div>
              <div><Label htmlFor="f-preferredSizeMax">متراژ تا</Label><Input id="f-preferredSizeMax" inputMode="numeric" dir="ltr" value={form.preferredSizeMax} onChange={(e) => setForm({ ...form, preferredSizeMax: e.target.value.replace(/[^0-9]/g, "") })} placeholder="120" className="mt-1" /></div>

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

              <div><Label htmlFor="f-nextFollowUpAt">پیگیری بعدی (شمسی)</Label><div className="mt-1"><JalaliDatePicker id="f-nextFollowUpAt" value={form.nextFollowUpAt || null} onChange={(v) => setForm({ ...form, nextFollowUpAt: v ?? "" })} /></div></div>
              <div className="flex items-center gap-2 pt-6"><input id="f-needsManagerReview" type="checkbox" checked={form.needsManagerReview === "true"} onChange={(e) => setForm({ ...form, needsManagerReview: e.target.checked ? "true" : "false" })} /><Label htmlFor="f-needsManagerReview">نیاز به بررسی مدیر</Label></div>
              {form.needsManagerReview === "true" && <div className="md:col-span-2"><Label htmlFor="f-managerReviewReason">دلیل بررسی</Label><Textarea id="f-managerReviewReason" value={form.managerReviewReason} onChange={(e) => setForm({ ...form, managerReviewReason: e.target.value })} className="mt-1" /></div>}
              {form.stage === "LOST" && <>
                <div><Label htmlFor="f-lostReasonCategory">دلیل از دست رفتن</Label><Select id="f-lostReasonCategory" value={form.lostReasonCategory} onChange={(e) => setForm({ ...form, lostReasonCategory: e.target.value })} className="mt-1"><option value="">انتخاب کنید</option><option value="CUSTOMER_WITHDREW">منصرف شد</option><option value="PRICE_REJECTED">قیمت نپذیرفت</option><option value="NO_RESPONSE">پاسخ نمی‌دهد</option><option value="NO_SUITABLE_PROPERTY">فایل مناسب نبود</option><option value="OTHER">سایر</option></Select></div>
                <div><Label htmlFor="f-lostReasonDetail">توضیح</Label><Input id="f-lostReasonDetail" value={form.lostReasonDetail} onChange={(e) => setForm({ ...form, lostReasonDetail: e.target.value })} className="mt-1" /></div>
              </>}
              <div className="md:col-span-2"><Label htmlFor="f-notes">توضیحات</Label><Textarea id="f-notes" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="توضیحات کلی درباره مشتری..." rows={3} className="mt-1" /></div>
              <div className="md:col-span-2"><Label htmlFor="f-notes-2">یادداشت</Label><Textarea id="f-notes-2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" rows={3} /></div>
            </div>
            <div className="mt-4"><Button onClick={save}>ذخیره</Button></div>
          </Card>
        </div>
      )}

      <div className="p-4 sm:p-6 grid gap-6 lg:grid-cols-[380px_1fr] items-start">
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
                {(c.tags as string[] ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(c.tags as string[]).map((t: string) => (
                      <span key={t} className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">{t}</span>
                    ))}
                  </div>
                )}
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
                            try {
                              await apiFetch(`/api/follow-ups/${f.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ done: e.target.checked }),
                              });
                              await refreshFollowUps();
                              load();
                            } catch (err2) { setError(errorMessage(err2)); }
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
                              try {
                                await apiFetch(`/api/follow-ups/${f.id}`, { method: "DELETE" });
                                await refreshFollowUps();
                                load();
                              } catch (err2) { setError(errorMessage(err2)); }
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
                                  try {
                                    await apiFetch(`/api/follow-ups/${f.id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ dueAt: followUpSaving }),
                                    });
                                    setFollowUpSaving(null);
                                    await refreshFollowUps();
                                    load();
                                  } catch (err2) { setError(errorMessage(err2)); }
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
                              try {
                                await apiFetch(`/api/follow-ups/${f.id}`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ done: true }),
                                });
                                await refreshFollowUps();
                                load();
                              } catch (err2) { setError(errorMessage(err2)); }
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

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
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
                className="w-full sm:w-auto"
                onClick={async () => {
                  if (!newFollowUpDate) return;
                  try {
                    await apiFetch(`/api/customers/${id}/follow-ups`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ dueAt: newFollowUpDate, note: newFollowUpNote || undefined }),
                    });
                    setNewFollowUpDate(null);
                    setNewFollowUpNote("");
                    await refreshFollowUps();
                    load();
                  } catch (err2) { setError(errorMessage(err2)); }
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
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><Wallet className="h-3.5 w-3.5" /> نوع معامله</dt>
                <dd className="font-medium min-w-0 break-words">{c.preferredDealType ? (DEAL_TYPE_LABELS[c.preferredDealType] ?? c.preferredDealType) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><Home className="h-3.5 w-3.5" /> نوع ملک</dt>
                <dd className="font-medium min-w-0 break-words">{c.preferredType ? (PROPERTY_TYPE_LABELS[c.preferredType] ?? c.preferredType) : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><MapPin className="h-3.5 w-3.5" /> مناطق</dt>
                <dd className="font-medium flex min-w-0 flex-wrap gap-1 justify-end">{(c.preferredAreas as string[] ?? []).length > 0 ? (c.preferredAreas as string[]).map((a: string) => <span key={a} className="rounded-full border border-[var(--line)] bg-[var(--paper-2)] px-2 py-0.5 text-[11px]">{a}</span>) : (c.preferredArea ? <span>{c.preferredArea}</span> : "—")}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><BedDouble className="h-3.5 w-3.5" /> خواب</dt>
                <dd className="font-medium min-w-0 break-words">{c.preferredBeds != null ? `${c.preferredBeds} خواب` : "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><Ruler className="h-3.5 w-3.5" /> متراژ</dt>
                <dd className="font-medium min-w-0 break-words" dir="ltr">
                  {c.preferredSizeMin != null || c.preferredSizeMax != null
                    ? `${c.preferredSizeMin ?? "—"} – ${c.preferredSizeMax ?? "—"} متر`
                    : "—"}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="flex shrink-0 items-center gap-1.5 text-zinc-500"><Wallet className="h-3.5 w-3.5" /> بودجه</dt>
                <dd className="font-medium text-left min-w-0 break-words" dir="ltr">
                  {c.preferredDealType === "RENT" ? (
                    c.budgetMax || (c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly ? (
                      <span className="text-right" dir="rtl">
                        ودیعه {c.budgetMax ? <MoneyText value={c.budgetMax} /> : "—"}
                        {" · "}
                        اجاره {(c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly ? <MoneyText value={(c as { budgetMaxMonthly?: string | null }).budgetMaxMonthly} /> : "—"}
                      </span>
                    ) : "—"
                  ) : c.budgetMin || c.budgetMax ? (
                    <>
                      {c.budgetMin ? <MoneyText value={c.budgetMin} bare /> : "—"} تا {c.budgetMax ? <MoneyText value={c.budgetMax} /> : "—"}
                    </>
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
              <div className="flex justify-between gap-2"><dt className="text-zinc-500 flex shrink-0 items-center gap-1.5"><User className="h-3.5 w-3.5" /> مشاور</dt><dd className="font-medium min-w-0 break-words">{c.assignedAgent?.name ?? "—"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-zinc-500 shrink-0">تاریخ ثبت</dt><dd className="min-w-0 break-words">{formatDate(c.createdAt)}</dd></div>
            </dl>
          </Card>

          <Card>
            <h3 className="flex items-center gap-2 text-sm font-semibold mb-2">
              <User className="h-4 w-4 text-zinc-500" /> انتقال به مشاور دیگر
            </h3>
            <p className="text-[12px] text-[var(--ink-3)] mb-3">مشتری مستقیم و بدون تأیید مدیر به مشاور دیگری منتقل می‌شود؛ پیگیری‌ها، معامله‌ها و بازدیدها با او منتقل می‌شوند.</p>
            {c.transfers && c.transfers.length > 0 && (
              <div className="mb-3 rounded-lg bg-zinc-50 p-3 text-[13px] space-y-2">
                <p>منتقل‌شده از: <span className="font-medium">{c.transfers[0].fromAgent?.name ?? "—"}</span></p>
                {c.transfers[0].fromAgent?.active ? (
                  <Button variant="outline" size="sm" onClick={revertTransfer} disabled={reverting}>
                    {reverting ? "در حال بازگرداندن..." : `بازگرداندن به ${c.transfers[0].fromAgent.name}`}
                  </Button>
                ) : (
                  <p className="text-[12px] text-[var(--ink-3)]">مشاور قبلی فعال نیست؛ از انتقال عادی استفاده کنید.</p>
                )}
              </div>
            )}
            {!isOwner && c.transfers && c.transfers.length > 0 && (
              <p className="text-[12px] text-amber-700 mb-3">این مشتری منتقل شده است؛ فقط مدیر می‌تواند دوباره منتقلش کند.</p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)} className="flex-1" aria-label="مشاور مقصد" disabled={!isOwner && (c.transfers?.length ?? 0) > 0}>
                <option value="">انتخاب مشاور...</option>
                {agents.filter((a) => a.id !== c.assignedAgent?.id).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}{a.role === "OWNER" ? " (مدیر)" : ""}</option>
                ))}
              </Select>
              <Button onClick={transferCustomer} disabled={!transferTo || transferring || (!isOwner && (c.transfers?.length ?? 0) > 0)} className="w-full sm:w-auto">
                {transferring ? "در حال انتقال..." : "انتقال بده"}
              </Button>
            </div>
            {transferOk && <p className="mt-2 text-[13px] font-medium text-green-700">{transferOk}</p>}
            {c.transfers && c.transfers.length > 0 && (
              <div className="mt-3">
                <p className="text-[13px] font-medium mb-1">سابقه انتقال</p>
                <ul className="space-y-1 text-[12px] text-[var(--ink-3)]">
                  {c.transfers.map((t) => (
                    <li key={t.id}>از {t.fromAgent?.name ?? "—"} به {t.toAgent?.name ?? "—"} — توسط {t.byUser?.name ?? "—"} — {formatDate(t.createdAt)}</li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
          <Card>
            <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> ثبت فعالیت / یادداشت</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={activityType} onChange={(e) => setActivityType(e.target.value)} className="w-full sm:w-36 sm:shrink-0">
                <option value="NOTE">یادداشت</option>
                <option value="CALL">تماس</option>
                <option value="MESSAGE">پیام</option>
                <option value="MEETING">جلسه</option>
                <option value="VIEWING_DONE">بازدید</option>
                <option value="APPRAISAL">کارشناسی</option>
                <option value="OTHER">سایر</option>
              </Select>
              <Input
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                placeholder="چی شد؟ چی گفتی؟ نتیجه چی بود..."
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), addActivity())}
                className="flex-1"
              />
              <Button onClick={addActivity} disabled={savingActivity || !activityText.trim()} className="w-full sm:w-auto">ثبت</Button>
            </div>
            {c.stage !== "WON" && c.stage !== "FAILED" && c.stage !== "LOST" && (
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <div className="mb-2 text-[12px] font-bold text-[var(--ink-2)]">نتیجه تماس — ثبت سریع</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {QUICK_CALLS.map((q) => (
                    <button
                      key={q.key}
                      type="button"
                      disabled={quickSaving !== null}
                      onClick={() => quickCall(q)}
                      className="rounded-[12px] border border-[var(--line)] bg-white px-2 py-2 text-right hover:bg-[var(--paper-2)] disabled:opacity-50"
                    >
                      <span className="block text-[12.5px] font-bold">{q.label}{quickSaving === q.key ? " ..." : ""}</span>
                      <span className="block text-[11px] text-[var(--ink-3)]">پیگیری {formatDate(isoInDays(q.days))}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <h3 className="font-semibold mb-3">ثبت بازدید با فایل</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Select value={visPropDealType} onChange={(e) => setVisPropDealType(e.target.value)} aria-label="نوع معامله">
                  <option value="">همه معاملات</option>
                  <option value="SALE">فروش</option>
                  <option value="RENT">رهن و اجاره</option>
                </Select>
                <Select value={visPropAdvisorId} onChange={(e) => setVisPropAdvisorId(e.target.value)} aria-label="مشاور">
                  <option value="">همه مشاورها</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </div>
              <div className="md:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={visPropDealType === "RENT" ? "قیمت/ودیعه از" : "قیمت از"}
                    value={visPropPriceMin}
                    onChange={(e) => setVisPropPriceMin(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                  <span className="text-[var(--ink-3)]">تا</span>
                  <Input
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={visPropDealType === "RENT" ? "قیمت/ودیعه تا" : "قیمت تا"}
                    value={visPropPriceMax}
                    onChange={(e) => setVisPropPriceMax(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
                {visPropDealType === "RENT" && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="اجاره ماهانه از"
                      value={visPropRentMin}
                      onChange={(e) => setVisPropRentMin(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                    <span className="text-[var(--ink-3)]">تا</span>
                    <Input
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="اجاره ماهانه تا"
                      value={visPropRentMax}
                      onChange={(e) => setVisPropRentMax(e.target.value.replace(/[^0-9]/g, ""))}
                    />
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <SearchSelect label="فایل / ملک" required value={visProperty} onChange={setVisProperty} options={visPropertyOptions} placeholder="فایل را جستجو و انتخاب کنید..." onSearchChange={setVisPropSearch} />
              </div>
              {visPropertyTotal !== null && visPropertyTotal > visPropertyOptions.length && (
                <p className="md:col-span-2 text-[11px] text-[var(--ink-3)]">
                  نمایش {toFaDigits(String(visPropertyOptions.length))} از {toFaDigits(String(visPropertyTotal))} فایل — فیلترها را محدودتر کنید.
                </p>
              )}
              <div>
                <Label htmlFor="f-visDate">تاریخ بازدید (شمسی) *</Label>
                <div className="mt-1"><JalaliDatePicker id="f-visDate" value={visDate} onChange={setVisDate} /></div>
              </div>
              <div>
                <Label htmlFor="f-visStatus">وضعیت</Label>
                <Select id="f-visStatus" className="mt-1" value={visStatus} onChange={(e) => setVisStatus(e.target.value)}>
                  <option value="SCHEDULED">قرار بازدید</option>
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
                  placeholder="مثلا: رفتیم بازدید، مشتری پسندید"
                />
              </div>
            </div>
            <div className="mt-3">
              <Button onClick={addViewing} disabled={savingVis}>{savingVis ? "..." : "ثبت بازدید"}</Button>
            </div>

            {viewings.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[12px] font-bold text-[var(--ink-2)]">بازدیدها ({viewings.length})</div>
                {viewings.map((v) => (
                  <div key={v.id} className="rounded-[12px] border border-[var(--line)] px-3 py-2 text-[13px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="text-[11px]">{v.status === "DONE" ? "انجام شد" : v.status === "CANCELED" ? "لغو" : "قرار بازدید"}</Badge>
                      <span className="font-bold">{formatDate(v.startAt)}</span>
                      {v.property && (
                        <Link href={`/properties/${v.property.id}`} className="text-[var(--ink-2)] hover:underline">
                          {v.property.code ? `${v.property.code} — ` : ""}{v.property.title}
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

          {nextPrompt && (
            <Card>
              <h3 className="font-semibold mb-1">فعالیت بعدی چیست؟</h3>
              <p className="text-[12px] text-[var(--ink-3)] mb-3">قدم بعدی این مشتری را همین‌جا مشخص کن تا در پیگیری‌ها ثبت شود.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <Select value={nextPrompt.type} onChange={(e) => setNextPrompt({ ...nextPrompt, type: e.target.value })} className="w-full sm:w-32 sm:shrink-0" aria-label="نوع فعالیت بعدی">
                  <option value="CALL">تماس</option>
                  <option value="MESSAGE">پیام</option>
                  <option value="MEETING">جلسه</option>
                  <option value="VIEWING_DONE">بازدید</option>
                </Select>
                <div className="flex-1">
                  <JalaliDatePicker value={nextPrompt.date} onChange={(v) => setNextPrompt({ ...nextPrompt, date: v })} placeholder="تاریخ فعالیت بعدی" />
                </div>
                <Input
                  value={nextPrompt.note}
                  onChange={(e) => setNextPrompt({ ...nextPrompt, note: e.target.value })}
                  placeholder="یادداشت (اختیاری)"
                  className="flex-1"
                />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  disabled={!nextPrompt.date || nextSaving}
                  onClick={async () => {
                    if (!nextPrompt.date) return;
                    setNextSaving(true);
                    try {
                      const note = [ACTIVITY_TYPE_LABELS[nextPrompt.type] ?? nextPrompt.type, nextPrompt.note.trim()].filter(Boolean).join(" — ");
                      await apiFetch(`/api/customers/${id}/follow-ups`, {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ dueAt: nextPrompt.date, note: note || undefined }),
                      });
                      setNextPrompt(null);
                      await refreshFollowUps();
                      load();
                    } catch (e) {
                      setError(errorMessage(e));
                    } finally {
                      setNextSaving(false);
                    }
                  }}
                >
                  {nextSaving ? "در حال ثبت..." : "ثبت فعالیت بعدی"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNextPrompt(null)}>رد کردن</Button>
              </div>
            </Card>
          )}

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
