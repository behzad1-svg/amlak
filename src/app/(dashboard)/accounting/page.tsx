"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label, NumberInput } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDate, formatToman, toEnDigits, toFaDigits } from "@/lib/utils";
import { isValidJalaliDate, jalaliToGregorian } from "@/lib/jalali";
import { DEFAULT_TAX_RATE_PCT } from "@/lib/constants";

type Summary = {
  isOwner: boolean;
  cashboxBalance: string | null;
  cashboxIn: string;
  cashboxOut: string;
  commissionTotal: string;
  commissionPaid: string;
  commissionUnpaid: string;
  /** فقط مدیر؛ برای مشاور null است */
  shiriniTotal: string | null;
  /** نرخ مالیات ارزش افزوده (٪) */
  taxRatePct: number;
  /** فقط مدیر؛ برای مشاور null است */
  taxTotal: string | null;
  unpaidCount: number;
  dealsCompleted: number;
  dealsWithCommission: number;
  officeTotal: string | null;
  debtToAgents: string | null;
};

type ShareView = {
  id: string | null;
  userId: string | null;
  name: string;
  pct: number;
  settled: boolean;
  settledAt: string | null;
  isExternal: boolean;
  amount: string;
  virtual: boolean;
};

type CommissionDeal = {
  id: string;
  status: string;
  contractAt: string | null;
  createdAt: string;
  commissionToman: string | null;
  commissionPercent: number | null;
  sellerShiriniToman: string | null;
  buyerShiriniToman: string | null;
  discountToman: string | null;
  commissionPaid: boolean;
  commissionPaidAt: string | null;
  dealSalePriceToman: string | null;
  dealDepositToman: string | null;
  dealMonthlyRentToman: string | null;
  officePct: number | null;
  officeAmount: string | null;
  shares: ShareView[];
  customer: { id: string; name: string; phone: string };
  property: { id: string; title: string; dealType: string; region: string };
  agent: { id: string; name: string };
};

type CashboxEntry = {
  id: string;
  type: "IN" | "OUT";
  amount: string;
  title: string;
  note: string | null;
  occurredAt: string;
  createdBy: { id: string; name: string };
  // ساخت‌یافته از سرور (از dealId/shareId حل می‌شود) — دستی‌ها null/عنوان‌اند
  dealCode: string | null;
  dealTitle: string | null;
  personName: string | null;
  purpose: string;
};

type AgentRow = {
  id: string;
  name: string;
  role: string;
  dealsCompleted: number;
  dealsWithCommission: number;
  saleVolume: string;
  commissionTotal: string;
  commissionPaid: string;
  commissionUnpaid: string;
};

type AgentsData = {
  users: AgentRow[];
  totals: {
    dealsCompleted: number;
    dealsWithCommission: number;
    saleVolume: string;
    commissionTotal: string;
    commissionPaid: string;
    commissionUnpaid: string;
    officeTotal: string;
    externalTotal: string;
    commissionGrandTotal: string;
  };
};

const DEAL_STATUS: Record<string, string> = {
  PENDING: "در جریان",
  COMPLETED: "قطعی",
  CANCELED: "لغوشده",
};

const DEAL_TYPE: Record<string, string> = { SALE: "فروش", RENT: "اجاره" };

type Tab = "summary" | "commissions" | "followups" | "cashbox" | "agents";

const TABS: { key: Tab; label: string; ownerOnly: boolean }[] = [
  { key: "summary", label: "خلاصه", ownerOnly: false },
  { key: "commissions", label: "کمیسیون‌ها", ownerOnly: false },
  { key: "followups", label: "پیگیری دریافتی‌ها", ownerOnly: false },
  { key: "cashbox", label: "صندوق دفتر", ownerOnly: true },
  { key: "agents", label: "گزارش مشاوران", ownerOnly: true },
];

type EditShare = {
  key: string;
  userId: string | null;
  name: string;
  pct: string;
  isExternal: boolean;
};

/** تقسیم مساوی (۱۰۰ − سهم دفتر) بین n سهم، با دقت صدم درصد و جمع دقیق. */
function equalSplit(officePct: number, count: number): number[] {
  if (count <= 0) return [];
  const totalHundredths = Math.round((100 - officePct) * 100);
  const per = Math.floor(totalHundredths / count);
  const rem = totalHundredths - per * count;
  return Array.from({ length: count }, (_, i) => (per + (i < rem ? 1 : 0)) / 100);
}

function daysSince(iso: string | null): number {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** مبلغ BigInt از رشته عددی API؛ خالی یا نامعتبر یعنی صفر. */
function bigNum(v: string | null): bigint {
  if (!v) return BigInt(0);
  try {
    return BigInt(v);
  } catch {
    return BigInt(0);
  }
}

/** معامله درآمد قابل‌تقسیم دارد؟ کمیسیون یا هر شیرینی بیشتر از صفر باشد. */
function dealHasIncome(d: Pick<CommissionDeal, "commissionToman" | "sellerShiriniToman" | "buyerShiriniToman">): boolean {
  return bigNum(d.commissionToman) > BigInt(0) || bigNum(d.sellerShiriniToman) > BigInt(0) || bigNum(d.buyerShiriniToman) > BigInt(0);
}

/** برچسب شیرینی‌های بیشتر از صفر برای ردیف معامله، مثل «شیرینی فروشنده ۵٬۰۰۰٬۰۰۰ تومان». */
function shiriniParts(d: Pick<CommissionDeal, "sellerShiriniToman" | "buyerShiriniToman">): string[] {
  const parts: string[] = [];
  if (bigNum(d.sellerShiriniToman) > BigInt(0)) parts.push(`شیرینی فروشنده ${formatToman(d.sellerShiriniToman)}`);
  if (bigNum(d.buyerShiriniToman) > BigInt(0)) parts.push(`شیرینی خریدار ${formatToman(d.buyerShiriniToman)}`);
  return parts;
}

export default function AccountingPage() {
  const { isOwner, loading: roleLoading } = useRole();
  const [tab, setTab] = useState<Tab>("summary");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [commissions, setCommissions] = useState<CommissionDeal[]>([]);
  // تب «پیگیری دریافتی‌ها» فهرست خودش را دارد (paid=unpaid) و از فیلتر تب کمیسیون‌ها اثر نمی‌پذیرد
  const [unpaid, setUnpaid] = useState<CommissionDeal[]>([]);
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [cashbox, setCashbox] = useState<{ entries: CashboxEntry[]; balance: string } | null>(null);
  const [agents, setAgents] = useState<AgentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);

  // فرم ویرایش قیمت و کمیسیون (فقط مدیر، در تب کمیسیون‌ها)
  const [editingDeal, setEditingDeal] = useState<CommissionDeal | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDeposit, setEditDeposit] = useState("");
  const [editRent, setEditRent] = useState("");
  const [editPercent, setEditPercent] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editSellerShirini, setEditSellerShirini] = useState("");
  const [editBuyerShirini, setEditBuyerShirini] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // سهم‌بندی در مودال ویرایش (فقط مدیر)
  const [editOfficePct, setEditOfficePct] = useState("50");
  const [editShares, setEditShares] = useState<EditShare[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; role: string; active: boolean }[]>([]);
  const [shareSettlingId, setShareSettlingId] = useState<string | null>(null);

  // فرم صندوق
  const [entryType, setEntryType] = useState<"IN" | "OUT">("IN");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryTitle, setEntryTitle] = useState("");
  const [entryNote, setEntryNote] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [entryDateError, setEntryDateError] = useState("");
  const [savingEntry, setSavingEntry] = useState(false);

  const loadBase = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, c, u] = await Promise.all([
        apiJson<Summary>("/api/accounting/summary"),
        apiJson<CommissionDeal[]>(`/api/accounting/commissions?paid=${paidFilter}`),
        apiJson<CommissionDeal[]>("/api/accounting/commissions?paid=unpaid"),
      ]);
      setSummary(s);
      setCommissions(c);
      setUnpaid(u);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [paidFilter]);

  const loadCashbox = useCallback(async () => {
    setTabLoading(true);
    setLoadError(null);
    try {
      setCashbox(await apiJson<{ entries: CashboxEntry[]; balance: string }>("/api/accounting/cashbox"));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setTabLoading(false);
    }
  }, []);

  const loadAgents = useCallback(async () => {
    setTabLoading(true);
    setLoadError(null);
    try {
      setAgents(await apiJson<AgentsData>("/api/accounting/agents"));
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await loadBase();
    })();
  }, [loadBase]);

  useEffect(() => {
    void (async () => {
      if (tab === "cashbox" && !cashbox) await loadCashbox();
      if (tab === "agents" && !agents) await loadAgents();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!editingDeal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEditingDeal(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingDeal]);

  async function toggleSettle(deal: CommissionDeal) {
    setActionError(null);
    setSettlingId(deal.id);
    try {
      await apiFetch(`/api/accounting/commissions/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commissionPaid: !deal.commissionPaid }),
      });
      await loadBase();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setSettlingId(null);
    }
  }

  async function toggleShareSettle(share: ShareView) {
    if (!share.id) return;
    setActionError(null);
    setShareSettlingId(share.id);
    try {
      await apiFetch(`/api/accounting/shares/${share.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settled: !share.settled }),
      });
      await loadBase();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setShareSettlingId(null);
    }
  }

  function openEdit(deal: CommissionDeal) {
    // معامله تسویه‌شده قفل است — دکمه ویرایش برایش نشان داده نمی‌شود؛ اینجا هم سد دوم است
    if (deal.commissionPaid) return;
    setEditingDeal(deal);
    setEditPrice(deal.dealSalePriceToman ?? "");
    setEditDeposit(deal.dealDepositToman ?? "");
    setEditRent(deal.dealMonthlyRentToman ?? "");
    // پیش‌فرض فروش ۰٫۲۵٪ فقط برای معامله‌ای است که هنوز هیچ درآمدی (کمیسیون یا شیرینی) ندارد؛
    // وگرنه باز کردن فرم برای ویرایش شیرینی، کمیسیونِ ازپیش‌پرشده را ناخواسته ذخیره می‌کرد.
    const hasIncome =
      (deal.commissionToman != null && deal.commissionToman !== "") ||
      (deal.sellerShiriniToman != null && deal.sellerShiriniToman !== "") ||
      (deal.buyerShiriniToman != null && deal.buyerShiriniToman !== "");
    const defaultPercent =
      deal.commissionPercent != null ? String(deal.commissionPercent) : !hasIncome && deal.property.dealType === "SALE" ? "0.25" : "";
    setEditPercent(defaultPercent);
    const amountSeed =
      deal.commissionToman != null && deal.commissionToman !== ""
        ? deal.commissionToman
        : !hasIncome && deal.property.dealType === "SALE" && deal.commissionPercent == null && deal.dealSalePriceToman
          ? (calcCommissionAmount(deal.dealSalePriceToman, "0.25") ?? "")
          : "";
    setEditAmount(amountSeed);
    setEditSellerShirini(deal.sellerShiriniToman ?? "");
    setEditBuyerShirini(deal.buyerShiriniToman ?? "");
    setEditDiscount(deal.discountToman ?? "");
    setEditError("");
    // سهم‌بندی: اگر سهم واقعی دارد همان را بیاور؛ وگرنه پیش‌فرض دفتر ۵۰٪ + مشاور معامله ۵۰٪ —
    // چه کمیسیون داشته باشد چه هنوز «تعیین نشده» باشد؛ وگرنه با محاسبه خودکار مبلغ از روی
    // قیمت × درصد، بخش سهم‌بندی با دفتر ۵۰٪ تنها و هشدار مجموع ۵۰٪ باز می‌شد.
    const realShares = deal.shares.filter((s) => !s.virtual);
    if (realShares.length > 0) {
      setEditOfficePct(deal.officePct != null ? String(deal.officePct) : "50");
      setEditShares(
        realShares.map((s, i) => ({
          key: `s-${s.id ?? i}`,
          userId: s.userId,
          name: s.name,
          pct: String(s.pct),
          isExternal: s.isExternal,
        }))
      );
    } else {
      setEditOfficePct("50");
      setEditShares([{ key: "s-new-0", userId: deal.agent.id, name: deal.agent.name, pct: "50", isExternal: false }]);
    }
    // لیست کاربران برای انتخاب مشاور در سهم‌ها
    apiJson<{ id: string; name: string; role: string; active: boolean }[]>("/api/users")
      .then((u) => setUsers(u.filter((x) => x.active)))
      .catch(() => undefined);
  }

  // تقسیم مساوی خودکار — فقط پیش‌فرض است؛ درصد دستی تا وقتی ترکیب عوض نشود می‌ماند.
  // با اضافه/حذف سهم یا عوض شدن سهم دفتر دوباره مساوی تقسیم می‌شود؛ تایپ دستی درصد، بقیه را عوض نمی‌کند.
  function resplitShares(officePctStr: string, shares: EditShare[]): EditShare[] {
    const office = Number(toEnDigits(officePctStr).replace(/[^0-9.]/g, "")) || 0;
    const pcts = equalSplit(office, shares.length);
    return shares.map((s, i) => ({ ...s, pct: String(pcts[i] ?? 0) }));
  }

  function onEditOfficePct(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditOfficePct(clean);
    setEditShares((prev) => resplitShares(clean, prev));
  }

  function addShareRow(isExternal: boolean) {
    setEditShares((prev) => {
      const next: EditShare[] = [...prev];
      if (isExternal) {
        next.push({ key: `s-new-${Date.now()}`, userId: null, name: "", pct: "0", isExternal: true });
      } else {
        const used = new Set(prev.map((s) => s.userId));
        const firstFree = users.find((u) => !used.has(u.id));
        next.push({
          key: `s-new-${Date.now()}`,
          userId: firstFree?.id ?? "",
          name: firstFree?.name ?? "",
          pct: "0",
          isExternal: false,
        });
      }
      return resplitShares(editOfficePct, next);
    });
  }

  function removeShareRow(key: string) {
    setEditShares((prev) => resplitShares(editOfficePct, prev.filter((s) => s.key !== key)));
  }

  function onSharePct(key: string, v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditShares((prev) => prev.map((s) => (s.key === key ? { ...s, pct: clean } : s)));
  }

  function onShareUser(key: string, userId: string) {
    setEditShares((prev) =>
      prev.map((s) => {
        if (s.key !== key) return s;
        const u = users.find((x) => x.id === userId);
        return { ...s, userId, name: u?.name ?? "" };
      })
    );
  }

  function sharesTotal(): number {
    const office = Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, "")) || 0;
    return office + editShares.reduce((t, s) => t + (Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) || 0), 0);
  }

  // بنر خطای مجموع، زنده با هر ویرایش به‌روز می‌شود: وقتی مجموع درست شد پاک می‌شود،
  // و تا وقتی غلط است عدد تازه را نشان می‌دهد — نه عدد لحظه ذخیره.
  useEffect(() => {
    void (async () => {
      if (!editError.startsWith("مجموع سهم دفتر")) return;
      const total = sharesTotal();
      if (Math.abs(total - 100) < 0.01) {
        setEditError("");
      } else {
        setEditError(`مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (الان ${toFaDigits(String(Math.round(total * 100) / 100))}٪ است)`);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOfficePct, editShares]);

  function onEditAmount(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditAmount(clean);
    // وقتی برای اولین بار مبلغ کمیسیون وارد می‌شود، سهم‌بندی با پیش‌فرض دفتر ۵۰٪ + مشاور معامله ۵۰٪ پر می‌شود
    if (clean !== "" && editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", isExternal: false }]);
    }
  }

  // شیرینی‌ها مثل مبلغ کمیسیون‌اند: عدد فارسی تمیز می‌شود؛ با اولین ورود، سهم‌بندی پیش‌فرض پر می‌شود
  function onEditSellerShirini(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditSellerShirini(clean);
    if (clean !== "" && editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", isExternal: false }]);
    }
  }

  function onEditBuyerShirini(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditBuyerShirini(clean);
    if (clean !== "" && editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", isExternal: false }]);
    }
  }

  // تخفیف مثل شیرینی عدد تمیز می‌شود؛ از مبنای تقسیم کم می‌شود ولی از مالیات کم نمی‌شود
  function onEditDiscount(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditDiscount(clean);
  }

  // محاسبه خودکار مبلغ کمیسیون از درصد × قیمت فروش (فقط فروش؛ اجاره دستی است).
  // فقط موقع تایپ قیمت یا درصد حساب می‌شود، پس مبلغ دستیِ ذخیره‌شده با باز شدن فرم عوض نمی‌شود.
  function calcCommissionAmount(price: string, percent: string): string | null {
    if (price === "" || percent === "") return null;
    const p = Number(price);
    const pc = Number(percent);
    if (!Number.isFinite(p) || !Number.isFinite(pc) || pc < 0 || pc > 100 || p <= 0) return null;
    return String(Math.round((p * pc) / 100));
  }

  function onEditPrice(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditPrice(clean);
    if (editingDeal?.property.dealType === "SALE") {
      const next = calcCommissionAmount(clean, editPercent);
      if (next !== null) setEditAmount(next);
    }
  }

  function onEditPercent(v: string) {
    // اعشار قبول می‌کند (۰٫۲۵)؛ ممیز فارسی ٫ هم به نقطه تبدیل می‌شود؛ حداکثر ۲ رقم اعشار
    let clean = toEnDigits(v).replace(/٫/g, ".").replace(/[^0-9.]/g, "");
    const dot = clean.indexOf(".");
    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    setEditPercent(clean);
    if (editingDeal?.property.dealType === "SALE") {
      const next = calcCommissionAmount(editPrice, clean);
      if (next !== null) setEditAmount(next);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeal) return;
    setEditError("");
    if (editPercent !== "") {
      const pct = Number(editPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        setEditError("درصد کمیسیون باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
    }
    // سهم‌بندی: هر درصد دستی قابل تغییر است؛ فقط مجموع باید دقیقاً ۱۰۰٪ شود
    const hasRealShares = editingDeal.shares.some((s) => !s.virtual);
    const sharesLocked = editingDeal.shares.some((s) => !s.virtual && s.settled);
    // درآمد قابل‌تقسیم (خالص) = کمیسیون + هر دو شیرینی منهای تخفیف؛ خالی یعنی صفر
    const editHasIncome = editAmount !== "" || editSellerShirini !== "" || editBuyerShirini !== "";
    const editTotal = (Number(editAmount) || 0) + (Number(editSellerShirini) || 0) + (Number(editBuyerShirini) || 0);
    const editDiscountNum = Number(editDiscount) || 0;
    // تخفیف نمی‌تواند بیشتر از جمع ناخالص (کمیسیون + شیرینی‌ها) باشد — خالص منفی نشود
    if (editDiscountNum > editTotal) {
      setEditError("تخفیف نمی‌تواند بیشتر از جمع کمیسیون و شیرینی باشد");
      return;
    }
    const editNet = editTotal - editDiscountNum;
    let shareBody: Record<string, unknown> = {};
    if (!editHasIncome && hasRealShares) {
      // خالی کردن کمیسیون و شیرینی، سهم‌بندی را هم پاک می‌کند (مگر سهمی تسویه شده باشد)
      if (sharesLocked) {
        setEditError("سهمی تسویه شده است؛ برای تغییر اول تسویه را برگردانید");
        return;
      }
      shareBody = { officePct: 100, shares: [] };
    } else if (editHasIncome && !sharesLocked) {
      if (editNet <= 0) {
        setEditError("جمع خالص (کمیسیون و شیرینی منهای تخفیف) باید بیشتر از صفر باشد");
        return;
      }
      const office = Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(office) || office < 0 || office > 100) {
        setEditError("سهم دفتر باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
      if (editShares.length === 0 && office < 100) {
        setEditError("مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود");
        return;
      }
      const total = sharesTotal();
      if (Math.abs(total - 100) >= 0.01) {
        setEditError(`مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (الان ${toFaDigits(String(Math.round(total * 100) / 100))}٪ است)`);
        return;
      }
      const seen = new Set<string>();
      for (const s of editShares) {
        const pct = Number(toEnDigits(s.pct).replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          setEditError("درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد");
          return;
        }
        if (s.isExternal) {
          if (!s.name.trim()) {
            setEditError("نام همکار بیرونی را وارد کنید");
            return;
          }
        } else {
          if (!s.userId) {
            setEditError("برای همه ردیف‌های سهم، مشاور انتخاب کنید");
            return;
          }
          if (seen.has(s.userId)) {
            setEditError("یک مشاور نمی‌تواند دو سهم در یک معامله داشته باشد");
            return;
          }
          seen.add(s.userId);
        }
      }
      shareBody = {
        officePct: office,
        shares: editShares.map((s) =>
          s.isExternal
            ? { name: s.name.trim(), pct: Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) }
            : { userId: s.userId, pct: Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) }
        ),
      };
    }
    setEditSaving(true);
    try {
      const isSale = editingDeal.property.dealType === "SALE";
      const body: Record<string, unknown> = {
        commissionPercent: editPercent === "" ? null : Number(editPercent),
        commissionToman: editAmount === "" ? null : toEnDigits(editAmount).replace(/[^0-9]/g, ""),
        sellerShiriniToman: editSellerShirini === "" ? null : toEnDigits(editSellerShirini).replace(/[^0-9]/g, ""),
        buyerShiriniToman: editBuyerShirini === "" ? null : toEnDigits(editBuyerShirini).replace(/[^0-9]/g, ""),
        // بدون درآمد، تخفیف هم معنا ندارد و پاک می‌شود (مثل سهم‌بندی)
        discountToman: !editHasIncome ? null : editDiscount === "" ? null : toEnDigits(editDiscount).replace(/[^0-9]/g, ""),
        ...shareBody,
      };
      if (isSale) body.dealSalePriceToman = editPrice === "" ? null : toEnDigits(editPrice).replace(/[^0-9]/g, "");
      else {
        body.dealDepositToman = editDeposit === "" ? null : toEnDigits(editDeposit).replace(/[^0-9]/g, "");
        body.dealMonthlyRentToman = editRent === "" ? null : toEnDigits(editRent).replace(/[^0-9]/g, "");
      }
      await apiFetch(`/api/deals/${editingDeal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setEditingDeal(null);
      await loadBase();
    } catch (err) {
      setEditError(errorMessage(err));
    } finally {
      setEditSaving(false);
    }
  }

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    setActionError(null);
    setEntryDateError("");
    // تاریخ شمسی «۱۴۰۵/۰۸/۲۵»؛ خالی یعنی امروز (مثل قبل)
    let occurredAt: string | null = null;
    const rawDate = toEnDigits(entryDate).trim();
    if (rawDate !== "") {
      const m = rawDate.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (!m || !isValidJalaliDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
        setEntryDateError("تاریخ شمسی معتبر نیست؛ مثل ۱۴۰۵/۰۸/۲۵ بنویسید");
        return;
      }
      occurredAt = jalaliToGregorian(Number(m[1]), Number(m[2]), Number(m[3])).toISOString();
    }
    setSavingEntry(true);
    try {
      await apiFetch("/api/accounting/cashbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: entryType,
          amount: toEnDigits(entryAmount).replace(/[^0-9]/g, ""),
          title: entryTitle,
          note: entryNote || null,
          occurredAt,
        }),
      });
      setEntryAmount("");
      setEntryTitle("");
      setEntryNote("");
      setEntryDate("");
      setEntryDateError("");
      await loadCashbox();
      await loadBase();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setSavingEntry(false);
    }
  }

  // مبنای پیش‌نمایش سهم‌بندی در فرم ویرایش: کمیسیون + هر دو شیرینی منهای تخفیف (خالی یعنی صفر)
  const editSplitBase = (Number(editAmount) || 0) + (Number(editSellerShirini) || 0) + (Number(editBuyerShirini) || 0) - (Number(editDiscount) || 0);

  // جمع ناخالص (کمیسیون + هر دو شیرینی) و خطای زنده تخفیف: تخفیف بیشتر از جمع ناخالص
  // همان خطای سرور است، ولی همان‌جا در فرم نشان داده می‌شود و ذخیره قفل می‌شود؛
  // چون از state مشتق شده، با برگشتن تخفیف به حد مجاز خودش پاک می‌شود.
  const editGross = (Number(editAmount) || 0) + (Number(editSellerShirini) || 0) + (Number(editBuyerShirini) || 0);
  const editDiscountOverGross = (Number(editDiscount) || 0) > editGross;

  // نرخ مالیات ارزش افزوده از خلاصه می‌آید؛ تا پیش از بارگذاری، پیش‌فرض
  const taxRate = summary?.taxRatePct ?? DEFAULT_TAX_RATE_PCT;

  /** مالیات ارزش افزوده یک معامله = نرخ × کمیسیون (ناخالص) — شیرینی و تخفیف در آن نیستند. */
  const taxOf = (d: Pick<CommissionDeal, "commissionToman">): number => {
    return Math.round((Number(bigNum(d.commissionToman)) * taxRate) / 100);
  };

  /** مالیات فرم ویرایش روی مبلغ کمیسیون فعلی حساب می‌شود (نه روی مبنای خالص). */
  const editTax = Math.round(((Number(editAmount) || 0) * taxRate) / 100);

  if (roleLoading) return <PageSkeleton rows={4} />;
  if (loading) return <PageSkeleton rows={4} />;
  if (loadError && !summary) return <PageError message={loadError} onRetry={loadBase} />;

  const visibleTabs = TABS.filter((t) => !t.ownerOnly || isOwner);

  return (
    <div>
      <Header
        title="حسابداری"
        subtitle="کمیسیون معامله‌ها، پیگیری دریافتی‌ها و صندوق دفتر — مشتری، مالک و مشاور همان‌هایی هستند که در CRM ثبت شده‌اند"
      />
      <div className="p-4 sm:p-6 space-y-6 max-w-[1200px]">
        {actionError && (
          <div className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{actionError}</div>
        )}

        <div className="flex flex-wrap gap-2">
          {visibleTabs.map((t) => (
            <Button key={t.key} size="sm" variant={tab === t.key ? "primary" : "outline"} onClick={() => setTab(t.key)}>
              {t.label}
            </Button>
          ))}
        </div>

        {tab === "summary" && summary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {isOwner && (
              <>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">موجودی صندوق</div>
                  <div className="text-[20px] font-extrabold">{formatToman(summary.cashboxBalance)}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">ورودی صندوق</div>
                  <div className="text-[20px] font-extrabold text-emerald-600">{formatToman(summary.cashboxIn)}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">خروجی صندوق</div>
                  <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.cashboxOut)}</div>
                </div>
              </>
            )}
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">مجموع کمیسیون</div>
              <div className="text-[20px] font-extrabold">{formatToman(summary.commissionTotal)}</div>
            </div>
            {isOwner && summary.shiriniTotal != null && (
              <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                <div className="text-[11px] text-[var(--ink-3)]">مجموع شیرینی</div>
                <div className="text-[20px] font-extrabold">{formatToman(summary.shiriniTotal)}</div>
              </div>
            )}
            {isOwner && summary.taxTotal != null && (
              <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                <div className="text-[11px] text-[var(--ink-3)]">مالیات ارزش افزوده</div>
                <div className="text-[20px] font-extrabold">{formatToman(summary.taxTotal)}</div>
              </div>
            )}
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">کمیسیون پرداخت‌شده</div>
              <div className="text-[20px] font-extrabold text-emerald-600">{formatToman(summary.commissionPaid)}</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">کمیسیون پرداخت‌نشده</div>
              <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.commissionUnpaid)}</div>
              <div className="text-[12px] text-[var(--ink-3)]">{toFaDigits(String(summary.unpaidCount))} مورد در انتظار دریافت</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">معامله قطعی</div>
              <div className="text-[20px] font-extrabold">{toFaDigits(String(summary.dealsCompleted))}</div>
            </div>
            <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
              <div className="text-[11px] text-[var(--ink-3)]">معامله با کمیسیون</div>
              <div className="text-[20px] font-extrabold">{toFaDigits(String(summary.dealsWithCommission))}</div>
            </div>
            {isOwner && (
              <>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">سهم دفتر</div>
                  <div className="text-[20px] font-extrabold">{formatToman(summary.officeTotal)}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">بدهی به مشاوران</div>
                  <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.debtToAgents)}</div>
                  <div className="text-[12px] text-[var(--ink-3)]">سهم‌های تسویه‌نشده</div>
                </div>
              </>
            )}
          </div>
        )}

        {(tab === "commissions" || tab === "followups") && (
          <Card>
            <CardHeader>
              <CardTitle>{tab === "commissions" ? "کمیسیون معامله‌ها" : "پیگیری دریافتی‌ها — کمیسیون‌های پرداخت‌نشده"}</CardTitle>
            </CardHeader>
            {tab === "commissions" && (
              <div className="mb-3 flex flex-wrap gap-2">
                {(
                  [
                    ["all", "همه"],
                    ["paid", "پرداخت‌شده"],
                    ["unpaid", "پرداخت‌نشده"],
                  ] as const
                ).map(([v, label]) => (
                  <Button key={v} size="sm" variant={paidFilter === v ? "primary" : "outline"} onClick={() => setPaidFilter(v)}>
                    {label}
                  </Button>
                ))}
              </div>
            )}
            {tab === "followups" && unpaid.length === 0 && (
              <p className="text-sm text-[var(--ink-3)]">کمیسیون پرداخت‌نشده‌ای نیست؛ همه دریافت شده‌اند.</p>
            )}
            {(tab === "commissions" ? commissions : unpaid).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-zinc-500 text-[12px]">
                      <th className="py-2 text-right">معامله</th>
                      {isOwner && <th className="py-2 text-right">مشاور</th>}
                      <th className="py-2">مبلغ معامله</th>
                      <th className="py-2">کمیسیون</th>
                      {isOwner && <th className="py-2 text-right">سهم‌بندی</th>}
                      <th className="py-2">وضعیت</th>
                      {tab === "followups" && <th className="py-2">از قرارداد</th>}
                      <th className="py-2">تسویه</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tab === "commissions" ? commissions : unpaid).map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2.5 pl-2 text-right">
                          <div className="font-medium">{d.property.title}</div>
                          <div className="text-[12px] text-[var(--ink-3)]">
                            {d.customer.name} · {DEAL_TYPE[d.property.dealType] ?? d.property.dealType} · {d.property.region}
                          </div>
                          <div className="text-[12px] text-[var(--ink-3)]">{formatDate(d.contractAt ?? d.createdAt)}</div>
                        </td>
                        {isOwner && <td className="py-2.5 text-right">{d.agent.name}</td>}
                        <td className="py-2.5 text-center">
                          {d.property.dealType === "RENT" ? (
                            <>
                              {formatToman(d.dealDepositToman)}
                              {d.dealMonthlyRentToman && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">
                                  اجاره ماهانه {formatToman(d.dealMonthlyRentToman)}
                                </span>
                              )}
                            </>
                          ) : (
                            formatToman(d.dealSalePriceToman)
                          )}
                        </td>
                        <td className="py-2.5 text-center font-bold">
                          {!dealHasIncome(d) ? (
                            <span className="font-normal text-[var(--ink-3)]">تعیین نشده</span>
                          ) : (
                            <>
                              {formatToman(d.commissionToman)}
                              {d.commissionPercent != null && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">{toFaDigits(String(d.commissionPercent))}٪</span>
                              )}
                              {shiriniParts(d).length > 0 && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">{shiriniParts(d).join(" · ")}</span>
                              )}
                              {bigNum(d.discountToman) > BigInt(0) && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">تخفیف {formatToman(d.discountToman)}</span>
                              )}
                              {taxOf(d) > 0 && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">مالیات ({toFaDigits(String(taxRate))}٪) {formatToman(taxOf(d))}</span>
                              )}
                              {!isOwner &&
                                d.shares.map((s) => (
                                  <span key={s.id ?? s.name} className="block text-[12px] font-normal text-[var(--ink-3)]">
                                    سهم من: {toFaDigits(String(s.pct))}٪ · {formatToman(s.amount)}
                                  </span>
                                ))}
                            </>
                          )}
                        </td>
                        {isOwner && (
                          <td className="py-2.5 text-right text-[12px]">
                            {!dealHasIncome(d) || d.shares.length === 0 ? (
                              <span className="text-[var(--ink-3)]">—</span>
                            ) : d.shares.some((s) => s.virtual) ? (
                              <span>تقسیم نشده — {d.shares[0]?.name} ۱۰۰٪</span>
                            ) : (
                              <div className="space-y-1">
                                <div>
                                  دفتر {toFaDigits(String(d.officePct ?? 0))}٪ · {formatToman(d.officeAmount)}
                                </div>
                                {d.shares.map((s) => (
                                  <div key={s.id ?? s.name} className="flex items-center justify-between gap-1.5">
                                    <span>
                                      {s.isExternal ? `تعاون: ${s.name}` : s.name} {toFaDigits(String(s.pct))}٪ · {formatToman(s.amount)}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1">
                                      <span className={s.settled ? "text-emerald-600 font-bold" : "text-red-600"}>
                                        {s.settled ? "تسویه شد" : "پرداخت‌نشده"}
                                      </span>
                                      <Button size="sm" variant="outline" disabled={shareSettlingId === s.id} onClick={() => toggleShareSettle(s)}>
                                        {s.settled ? "برگرداندن" : "تسویه"}
                                      </Button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        )}
                        <td className="py-2.5 text-center">{DEAL_STATUS[d.status] ?? d.status}</td>
                        {tab === "followups" && (
                          <td className="py-2.5 text-center">
                            <span className="text-red-600 font-bold">{toFaDigits(String(daysSince(d.contractAt ?? d.createdAt)))} روز</span>
                          </td>
                        )}
                        <td className="py-2.5 text-center">
                          {!dealHasIncome(d) ? (
                            <span className="text-[var(--ink-3)]">—</span>
                          ) : d.commissionPaid ? (
                            <span className="text-emerald-600 font-bold">دریافت شد{isOwner ? ` · ${formatDate(d.commissionPaidAt)}` : ""}</span>
                          ) : (
                            <span className="text-red-600 font-bold">پرداخت‌نشده</span>
                          )}
                          {isOwner && dealHasIncome(d) && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" disabled={settlingId === d.id} onClick={() => toggleSettle(d)}>
                                {d.commissionPaid ? "برگرداندن" : "دریافت شد"}
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && !dealHasIncome(d) && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                                تعیین کمیسیون
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && dealHasIncome(d) && !d.commissionPaid && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" onClick={() => openEdit(d)}>
                                ویرایش
                              </Button>
                            </div>
                          )}
                          {isOwner && tab === "commissions" && d.commissionPaid && (
                            <div className="mt-1 text-[11px] text-[var(--ink-3)]">دریافت شده؛ برای تغییر اول دریافت را برگردان</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "commissions" && commissions.length === 0 && (
              <p className="text-sm text-[var(--ink-3)]">هنوز معامله‌ای ثبت نشده است.</p>
            )}
            <p className="mt-3 text-[12px] text-[var(--ink-3)]">
              قیمت، کمیسیون و شیرینی هر معامله را مدیر در همین‌جا نهایی می‌کند؛ تا پیش از تسویه قابل ویرایش است و پس از تسویه قفل می‌شود. سهم‌بندی
              (دفتر، مشاوران و تعاون) روی جمع خالص (کمیسیون و شیرینی منهای تخفیف) انجام می‌شود و هر سهم جداگانه تسویه می‌شود.
            </p>
          </Card>
        )}

        {tab === "cashbox" && isOwner && (
          <>
            <Card>
              <CardHeader><CardTitle>ثبت ورودی / خروجی صندوق</CardTitle></CardHeader>
              <form onSubmit={submitEntry} className="space-y-3">
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={entryType === "IN" ? "primary" : "outline"} onClick={() => setEntryType("IN")}>
                    ورودی
                  </Button>
                  <Button type="button" size="sm" variant={entryType === "OUT" ? "primary" : "outline"} onClick={() => setEntryType("OUT")}>
                    خروجی
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="block text-[13px]">
                    مبلغ (تومان)
                    <input
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      inputMode="numeric"
                      value={entryAmount}
                      onChange={(e) => setEntryAmount(toEnDigits(e.target.value).replace(/[^0-9]/g, ""))}
                      placeholder="مثلاً ۵۰۰۰۰۰۰"
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    عنوان
                    <input
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      value={entryTitle}
                      onChange={(e) => setEntryTitle(e.target.value)}
                      placeholder="مثلاً دریافت کمیسیون معامله…"
                      required
                    />
                  </label>
                  <label className="block text-[13px]">
                    تاریخ (اختیاری — پیش‌فرض امروز)
                    <input
                      className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                      inputMode="numeric"
                      dir="ltr"
                      value={entryDate}
                      onChange={(e) => {
                        setEntryDate(toEnDigits(e.target.value).replace(/[^0-9/]/g, ""));
                        setEntryDateError("");
                      }}
                      placeholder="۱۴۰۵/۰۸/۲۵"
                    />
                    {entryDateError && <span className="mt-1 block text-[12px] text-red-600">{entryDateError}</span>}
                  </label>
                </div>
                <label className="block text-[13px]">
                  توضیح (اختیاری)
                  <input
                    className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                    value={entryNote}
                    onChange={(e) => setEntryNote(e.target.value)}
                  />
                </label>
                <Button type="submit" disabled={savingEntry}>
                  {savingEntry ? "در حال ثبت…" : "ثبت در صندوق"}
                </Button>
              </form>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>گردش صندوق {cashbox ? `— موجودی: ${formatToman(cashbox.balance)}` : ""}</CardTitle>
              </CardHeader>
              {tabLoading && !cashbox ? (
                <PageSkeleton rows={3} />
              ) : cashbox && cashbox.entries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-zinc-500 text-[12px]">
                        <th className="py-2 text-right">بابت</th>
                        <th className="py-2 text-right">معامله</th>
                        <th className="py-2 text-right">مبدا / مقصد</th>
                        <th className="py-2">نوع</th>
                        <th className="py-2">مبلغ</th>
                        <th className="py-2">تاریخ</th>
                        <th className="py-2 text-right">ثبت‌کننده</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cashbox.entries.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="py-2.5 pl-2 text-right">
                            <div className="font-medium">{e.purpose}</div>
                            {e.note && <div className="text-[12px] text-[var(--ink-3)]">{e.note}</div>}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            {e.dealTitle ? (
                              <div>{e.dealCode ? `${e.dealCode} — ` : ""}{e.dealTitle}</div>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            {e.personName ?? <span className="text-zinc-400">—</span>}
                          </td>
                          <td className="py-2.5 text-center">
                            <span className={e.type === "IN" ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                              {e.type === "IN" ? "ورودی" : "خروجی"}
                            </span>
                          </td>
                          <td className="py-2.5 text-center font-bold">{formatToman(e.amount)}</td>
                          <td className="py-2.5 text-center">{formatDate(e.occurredAt)}</td>
                          <td className="py-2.5 text-right">{e.createdBy.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-[var(--ink-3)]">هنوز ورودی یا خروجی‌ای در صندوق ثبت نشده است — صندوق از صفر شروع می‌شود.</p>
              )}
            </Card>
          </>
        )}

        {tab === "agents" && isOwner && (
          <Card>
            <CardHeader><CardTitle>گزارش مشاوران — کمیسیون و فروش</CardTitle></CardHeader>
            {tabLoading && !agents ? (
              <PageSkeleton rows={3} />
            ) : agents ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-zinc-500 text-[12px]">
                      <th className="py-2 text-right">مشاور</th>
                      <th className="py-2">قرارداد قطعی</th>
                      <th className="py-2">حجم فروش قطعی</th>
                      <th className="py-2">مجموع کمیسیون</th>
                      <th className="py-2">پرداخت‌شده</th>
                      <th className="py-2">پرداخت‌نشده</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2.5 pr-2 font-medium text-right">{u.name} {u.role === "OWNER" ? "(مدیر)" : ""}</td>
                        <td className="text-center">{toFaDigits(String(u.dealsCompleted))}</td>
                        <td className="text-center">{formatToman(u.saleVolume)}</td>
                        <td className="text-center font-bold">{formatToman(u.commissionTotal)}</td>
                        <td className="text-center text-emerald-600">{formatToman(u.commissionPaid)}</td>
                        <td className="text-center">
                          <span className={BigInt(u.commissionUnpaid) > BigInt(0) ? "text-red-600 font-bold" : ""}>{formatToman(u.commissionUnpaid)}</span>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold bg-[var(--paper-2)]">
                      <td className="py-2.5 pr-2 text-right">جمع کل</td>
                      <td className="text-center">{toFaDigits(String(agents.totals.dealsCompleted))}</td>
                      <td className="text-center">{formatToman(agents.totals.saleVolume)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionTotal)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionPaid)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionUnpaid)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[12px] text-[var(--ink-3)]">
                سهم دفتر: {formatToman(agents.totals.officeTotal)} · تعاون (بیرونی): {formatToman(agents.totals.externalTotal)} · جمع کل درآمد (کمیسیون +{" "}
                شیرینی − تخفیف): {formatToman(agents.totals.commissionGrandTotal)}
              </p>
              </>
            ) : null}
          </Card>
        )}

        {editingDeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <button type="button" className="absolute inset-0 bg-black/40" onClick={() => setEditingDeal(null)} aria-label="بستن" />
            <div
              role="dialog"
              aria-modal="true"
              aria-label={!dealHasIncome(editingDeal) ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
              className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-[16px] border border-[var(--line)] bg-white p-5 shadow-xl"
            >
              <h3 className="text-[15px] font-extrabold">
                {!dealHasIncome(editingDeal) ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
              </h3>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                {editingDeal.property.title} · {editingDeal.customer.name} · {DEAL_TYPE[editingDeal.property.dealType] ?? editingDeal.property.dealType}
              </p>
              <form onSubmit={saveEdit} className="mt-4 space-y-3">
                {editingDeal.property.dealType === "SALE" ? (
                  <MoneyInput
                    label="قیمت فروش معامله (تومان)"
                    value={editPrice}
                    onChange={onEditPrice}
                    placeholder="مثلا ۱۰۰۰۰۰۰۰۰۰۰"
                  />
                ) : (
                  <>
                    <MoneyInput
                      label="ودیعه معامله (تومان)"
                      value={editDeposit}
                      onChange={(v) => setEditDeposit(toEnDigits(v).replace(/[^0-9]/g, ""))}
                      placeholder="مثلا ۵۰۰۰۰۰۰۰۰"
                    />
                    <MoneyInput
                      label="اجاره ماهانه (تومان)"
                      value={editRent}
                      onChange={(v) => setEditRent(toEnDigits(v).replace(/[^0-9]/g, ""))}
                      placeholder="مثلا ۲۰۰۰۰۰۰۰"
                    />
                  </>
                )}
                <div>
                  <Label htmlFor="f-editPercent">درصد کمیسیون (۰ تا ۱۰۰)</Label>
                  <NumberInput
                    id="f-editPercent"
                    className="mt-1"
                    value={editPercent}
                    onChange={(e) => onEditPercent(e.target.value)}
                    placeholder="مثلا ۰٫۲۵"
                    allowDecimal
                  />
                </div>
                <MoneyInput
                  label="مبلغ کمیسیون (تومان)"
                  value={editAmount}
                  onChange={onEditAmount}
                  placeholder="مثلا ۵۰۰۰۰۰۰۰"
                  hint="خالی بماند یعنی بدون کمیسیون"
                />
                <MoneyInput
                  label="شیرینی فروشنده (تومان)"
                  value={editSellerShirini}
                  onChange={onEditSellerShirini}
                  placeholder="مثلا ۱۰۰۰۰۰۰۰"
                  hint="اختیاری — خالی یعنی صفر"
                />
                <MoneyInput
                  label="شیرینی خریدار (تومان)"
                  value={editBuyerShirini}
                  onChange={onEditBuyerShirini}
                  placeholder="مثلا ۱۰۰۰۰۰۰۰"
                  hint="اختیاری — خالی یعنی صفر"
                />
                <MoneyInput
                  label="تخفیف (تومان)"
                  value={editDiscount}
                  onChange={onEditDiscount}
                  placeholder="مثلا ۲۰۰۰۰۰۰"
                  hint="اختیاری — خالی یعنی صفر؛ از مبنای تقسیم کم می‌شود ولی از مالیات کم نمی‌شود"
                />
                {editDiscountOverGross && (
                  <p className="text-[12px] text-red-700">تخفیف نمی‌تواند بیشتر از جمع کمیسیون و شیرینی باشد</p>
                )}
                <p className="text-[11px] text-[var(--ink-3)]">
                  {editingDeal.property.dealType === "SALE"
                    ? "مبلغ از روی درصد × قیمت فروش حساب می‌شود؛ می‌توانید دستی هم عوضش کنید."
                    : "برای اجاره مبلغ کمیسیون دستی وارد می‌شود."}
                </p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  شیرینی با کمیسیون جمع می‌شود و با همان سهم‌بندی تقسیم می‌شود؛ درصد کمیسیون فقط مبلغ کمیسیون را از روی قیمت حساب می‌کند.
                </p>
                {(editSplitBase > 0 || editTax > 0) && !editDiscountOverGross && (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
                    <div>مالیات ارزش افزوده ({toFaDigits(String(taxRate))}٪): {formatToman(editTax)}</div>
                    <div className="font-bold">جمع دریافتی از مشتری: {formatToman(editSplitBase + editTax)}</div>
                    <div className="text-[11px] text-[var(--ink-3)]">مالیات فقط روی کمیسیون حساب می‌شود و جزو تقسیم درآمد نیست.</div>
                  </div>
                )}
                {/* سهم‌بندی — فقط وقتی کمیسیون یا شیرینی تعیین شده باشد؛ هر درصد دستی قابل تغییر است */}
                {editSplitBase <= 0 ? (
                  editingDeal.shares.some((s) => !s.virtual) ? (
                    <p className="text-[12px] text-amber-700">با خالی کردن مبلغ کمیسیون و شیرینی، سهم‌بندی این معامله هم پاک می‌شود.</p>
                  ) : (
                    <p className="text-[12px] text-[var(--ink-3)]">برای سهم‌بندی اول مبلغ کمیسیون یا شیرینی را وارد کنید.</p>
                  )
                ) : editingDeal.shares.some((s) => !s.virtual && s.settled) ? (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3">
                    <b className="text-[13px]">سهم‌بندی</b>
                    <p className="mt-1 text-[12px] text-[var(--ink-3)]">سهمی تسویه شده است؛ برای تغییر اول تسویه را برگردانید.</p>
                    <div className="mt-2 space-y-1 text-[12px]">
                      <div>دفتر {toFaDigits(String(editingDeal.officePct ?? 0))}٪</div>
                      {editingDeal.shares
                        .filter((s) => !s.virtual)
                        .map((s) => (
                          <div key={s.id ?? s.name}>
                            {s.isExternal ? `تعاون: ${s.name}` : s.name} {toFaDigits(String(s.pct))}٪{s.settled ? " · تسویه شد" : ""}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[#fafcfe] p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[13px]">👥 سهم‌بندی کمیسیون و شیرینی</b>
                      <span className={Math.abs(sharesTotal() - 100) < 0.01 ? "text-[12px] text-emerald-600 font-bold" : "text-[12px] text-red-600 font-bold"}>
                        {Math.abs(sharesTotal() - 100) < 0.01
                          ? "✓ مجموع ۱۰۰٪ است"
                          : `⚠ مجموع ${toFaDigits(String(Math.round(sharesTotal() * 100) / 100))}٪ است — باید ۱۰۰٪ شود`}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-[13px]">
                        سهم دفتر ٪
                        <input
                          className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                          inputMode="decimal"
                          value={editOfficePct}
                          onChange={(e) => onEditOfficePct(e.target.value)}
                        />
                      </label>
                      <div className="text-[13px]">
                        مبلغ سهم دفتر
                        <div className="mt-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]">
                          {formatToman(
                            editSplitBase <= 0
                              ? null
                              : String(Math.round((editSplitBase * (Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, "")) || 0)) / 100))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {editShares.map((s) => (
                        <div key={s.key} className="flex flex-wrap items-end gap-2">
                          {s.isExternal ? (
                            <label className="block flex-1 min-w-[140px] text-[13px]">
                              همکار بیرونی (تعاون)
                              <input
                                className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                                value={s.name}
                                onChange={(e) =>
                                  setEditShares((prev) => prev.map((x) => (x.key === s.key ? { ...x, name: e.target.value } : x)))
                                }
                                placeholder="نام دفتر یا شخص"
                              />
                            </label>
                          ) : (
                            <label className="block flex-1 min-w-[140px] text-[13px]">
                              مشاور
                              <select
                                className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                                value={s.userId ?? ""}
                                onChange={(e) => onShareUser(s.key, e.target.value)}
                              >
                                <option value="">— انتخاب مشاور —</option>
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="block w-[90px] text-[13px]">
                            سهم ٪
                            <input
                              className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                              inputMode="decimal"
                              value={s.pct}
                              onChange={(e) => onSharePct(s.key, e.target.value)}
                            />
                          </label>
                          <span className="pb-2 text-[12px] text-[var(--ink-3)]">
                            {formatToman(
                              editSplitBase <= 0
                                ? null
                                : String(Math.round((editSplitBase * (Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) || 0)) / 100))
                            )}
                          </span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeShareRow(s.key)} aria-label="حذف سهم">
                            ✕
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => addShareRow(false)}>
                        ＋ افزودن مشاور
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => addShareRow(true)}>
                        ＋ افزودن همکار بیرونی (تعاون)
                      </Button>
                    </div>
                    <p className="text-[11px] text-[var(--ink-3)]">
                      با اضافه یا حذف سهم، یا با عوض شدن سهم دفتر، سهم مشاورها خودکار مساوی تقسیم می‌شود؛ هر درصد را می‌توانید دستی هم عوض کنید و تا وقتی ترکیب
                      عوض نشود می‌ماند.
                    </p>
                  </div>
                )}
                {editError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={editSaving || editDiscountOverGross}>
                    {editSaving ? "در حال ذخیره..." : "ذخیره"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingDeal(null)} disabled={editSaving}>
                    انصراف
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
