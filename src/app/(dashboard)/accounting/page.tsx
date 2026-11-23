"use client";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label, NumberInput } from "@/components/ui/Input";
import { MoneyInput } from "@/components/ui/MoneyInput";
import { Modal } from "@/components/ui/Modal";
import { PageError, PageSkeleton } from "@/components/ui/LoadState";
import { useRole } from "@/hooks/useRole";
import { apiFetch, apiJson, errorMessage } from "@/lib/api";
import { formatDate, formatToman, toEnDigits, toFaDigits } from "@/lib/utils";
import { isValidJalaliDate, jalaliToGregorian } from "@/lib/jalali";
import { DEFAULT_TAX_RATE_PCT } from "@/lib/constants";
import { DEFAULT_SALE_COMMISSION_PCT, splitRentSide, splitSaleSide } from "@/lib/commission";

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
  /** فقط مدیر؛ تفکیک سهم دفتر به کمیسیون و شیرینی */
  officeCommissionTotal: string | null;
  officeShiriniTotal: string | null;
  debtToAgents: string | null;
  /** فقط مدیر؛ تفکیک بدهی به مشاوران به کمیسیون و شیرینی */
  debtToAgentsCommission: string | null;
  debtToAgentsShirini: string | null;
};

type ShareView = {
  id: string | null;
  userId: string | null;
  name: string;
  pct: number;
  /** سهم از شیرینی (٪) — همیشه عدد است؛ خالی ذخیره‌شده یعنی همان pct */
  shiriniPct: number;
  settled: boolean;
  settledAt: string | null;
  isExternal: boolean;
  amount: string;
  /** تفکیک مبلغ سهم: چقدرش کمیسیون و چقدرش شیرینی */
  commissionAmount: string;
  shiriniAmount: string;
  virtual: boolean;
};

type CommissionDeal = {
  id: string;
  status: string;
  contractAt: string | null;
  createdAt: string;
  commissionToman: string | null;
  commissionPercent: number | null;
  sellerCommissionToman: string | null;
  sellerCommissionPercent: number | null;
  buyerCommissionToman: string | null;
  buyerCommissionPercent: number | null;
  sellerReceivedToman: string | null;
  buyerReceivedToman: string | null;
  sellerShiriniToman: string | null;
  buyerShiriniToman: string | null;
  discountToman: string | null;
  sellerDiscountToman: string | null;
  buyerDiscountToman: string | null;
  commissionPaid: boolean;
  commissionPaidAt: string | null;
  dealSalePriceToman: string | null;
  dealDepositToman: string | null;
  dealMonthlyRentToman: string | null;
  officePct: number | null;
  /** سهم دفتر از شیرینی (٪)؛ خالی یعنی همان officePct */
  officeShiriniPct: number | null;
  officeAmount: string | null;
  officeCommissionAmount: string | null;
  officeShiriniAmount: string | null;
  shares: ShareView[];
  customer: { id: string; name: string; phone: string };
  property: { id: string; title: string; dealType: string; region: string; salePriceToman: string | null; depositToman: string | null; monthlyRentToman: string | null };
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
  /** تفکیک مجموع سهم مشاور به کمیسیون و شیرینی */
  commissionPart: string;
  shiriniPart: string;
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
    commissionPart: string;
    shiriniPart: string;
    commissionPaid: string;
    commissionUnpaid: string;
    officeTotal: string;
    officeCommissionTotal: string;
    officeShiriniTotal: string;
    externalTotal: string;
    externalCommissionTotal: string;
    externalShiriniTotal: string;
    commissionGrandTotal: string;
    grandTotalCommission: string;
    grandTotalShirini: string;
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
  /** سهم از شیرینی (٪) — جدا از سهم از کمیسیون */
  shiriniPct: string;
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
function dealHasIncome(
  d: Pick<CommissionDeal, "commissionToman" | "sellerCommissionToman" | "buyerCommissionToman" | "sellerShiriniToman" | "buyerShiriniToman">,
): boolean {
  return dealTotalCommission(d) > BigInt(0) || bigNum(d.sellerShiriniToman) > BigInt(0) || bigNum(d.buyerShiriniToman) > BigInt(0);
}

/** برچسب طرف‌های معامله بر اساس نوع آن: فروش → فروشنده/خریدار؛ اجاره → مالک/مستاجر. */
function sideLabels(dealType: string): { seller: string; buyer: string } {
  return dealType === "RENT" ? { seller: "مالک", buyer: "مستاجر" } : { seller: "فروشنده", buyer: "خریدار" };
}

/** کمیسیون کل معامله: جمع دو طرف وقتی دست‌کم یک طرف ثبت شده، وگرنه تک‌کمیسیون قدیمی. */
function dealTotalCommission(
  d: Pick<CommissionDeal, "commissionToman" | "sellerCommissionToman" | "buyerCommissionToman">,
): bigint {
  if (d.sellerCommissionToman != null || d.buyerCommissionToman != null) {
    return bigNum(d.sellerCommissionToman) + bigNum(d.buyerCommissionToman);
  }
  return bigNum(d.commissionToman);
}

/** تخفیف کل معامله: جمع تخفیف دو طرف، وگرنه تخفیف تک‌فیلدی قدیمی. */
function dealTotalDiscount(
  d: Pick<CommissionDeal, "discountToman" | "sellerDiscountToman" | "buyerDiscountToman">,
): bigint {
  if (d.sellerDiscountToman != null || d.buyerDiscountToman != null) {
    return bigNum(d.sellerDiscountToman) + bigNum(d.buyerDiscountToman);
  }
  return bigNum(d.discountToman);
}

/** شیرینی کل معامله: شیرینی فروشنده + شیرینی خریدار. */
function dealTotalShirini(d: Pick<CommissionDeal, "sellerShiriniToman" | "buyerShiriniToman">): bigint {
  return bigNum(d.sellerShiriniToman) + bigNum(d.buyerShiriniToman);
}

/** دریافتی کل معامله: دریافتی از فروشنده + دریافتی از خریدار (هر کدام خالی یعنی صفر). */
function dealTotalReceived(d: Pick<CommissionDeal, "sellerReceivedToman" | "buyerReceivedToman">): bigint {
  return bigNum(d.sellerReceivedToman) + bigNum(d.buyerReceivedToman);
}

/** آیا معامله دوطرفه ثبت شده است (دست‌کم یک فیلد طرفی دارد)؟ */
function dealHasSides(
  d: Pick<CommissionDeal, "sellerCommissionToman" | "buyerCommissionToman" | "sellerReceivedToman" | "buyerReceivedToman" | "sellerDiscountToman" | "buyerDiscountToman">,
): boolean {
  return (
    d.sellerCommissionToman != null ||
    d.buyerCommissionToman != null ||
    d.sellerReceivedToman != null ||
    d.buyerReceivedToman != null ||
    d.sellerDiscountToman != null ||
    d.buyerDiscountToman != null
  );
}

/** برچسب شیرینی‌های بیشتر از صفر برای ردیف معامله، مثل «شیرینی فروشنده ۵٬۰۰۰٬۰۰۰ تومان». */
function shiriniParts(d: Pick<CommissionDeal, "sellerShiriniToman" | "buyerShiriniToman">, dealType: string): string[] {
  const labels = sideLabels(dealType);
  const parts: string[] = [];
  if (bigNum(d.sellerShiriniToman) > BigInt(0)) parts.push(`شیرینی ${labels.seller} ${formatToman(d.sellerShiriniToman)}`);
  if (bigNum(d.buyerShiriniToman) > BigInt(0)) parts.push(`شیرینی ${labels.buyer} ${formatToman(d.buyerShiriniToman)}`);
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
  // پیش‌نمایش جزئیات کمیسیون — فقط خواندنی، بدون ورود به حالت ویرایش
  const [previewDeal, setPreviewDeal] = useState<CommissionDeal | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDeposit, setEditDeposit] = useState("");
  const [editRent, setEditRent] = useState("");
  // کمیسیون و دریافتی دوطرفه — هر طرف جدا: فروشنده/خریدار (اجاره: مالک/مستاجر).
  // دریافتی هر طرف کمکی برای تقسیم خودکار همان طرف است و ذخیره هم می‌شود.
  const [editSellerPercent, setEditSellerPercent] = useState("");
  const [editSellerAmount, setEditSellerAmount] = useState("");
  const [editSellerReceived, setEditSellerReceived] = useState("");
  const [editSellerShirini, setEditSellerShirini] = useState("");
  const [editSellerDiscount, setEditSellerDiscount] = useState("");
  const [editBuyerPercent, setEditBuyerPercent] = useState("");
  const [editBuyerAmount, setEditBuyerAmount] = useState("");
  const [editBuyerReceived, setEditBuyerReceived] = useState("");
  const [editBuyerShirini, setEditBuyerShirini] = useState("");
  const [editBuyerDiscount, setEditBuyerDiscount] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  // سهم‌بندی در مودال ویرایش (فقط مدیر)
  const [editOfficePct, setEditOfficePct] = useState("50");
  const [editOfficeShiriniPct, setEditOfficeShiriniPct] = useState("50");
  const [editShares, setEditShares] = useState<EditShare[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string; role: string; active: boolean }[]>([]);
  // لیست مشاورها موقع باز شدن صفحه لود می‌شود تا کشوی انتخاب مشاور هیچ‌وقت
  // خالی نماند؛ خطای لود پنهان نمی‌شود و دکمه تلاش دوباره دارد.
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
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

  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const u = await apiJson<{ id: string; name: string; role: string; active: boolean }[]>("/api/users");
      setUsers(u.filter((x) => x.active));
    } catch (e) {
      setUsersError(errorMessage(e));
    } finally {
      setUsersLoading(false);
    }
  }, []);

  // لیست مشاورها برای کشوی سهم‌ها، موقع باز شدن صفحه (فقط مدیر — کشو فقط در مودال مدیر است)
  useEffect(() => {
    if (isOwner) void loadUsers();
  }, [isOwner, loadUsers]);

  useEffect(() => {
    void (async () => {
      if (tab === "cashbox" && !cashbox) await loadCashbox();
      if (tab === "agents" && !agents) await loadAgents();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

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
    const hasIncome = dealHasIncome(deal);
    const isSale = deal.property.dealType === "SALE";
    // طرف فروشنده: فیلد طرفی اگر هست، وگرنه تک‌کمیسیون قدیمی همان طرف فروشنده است
    // (جمع کل عوض نمی‌شود)؛ معامله تازه در فروش هر دو طرف ۰٫۲۵٪ پیش‌فرض می‌گیرد.
    setEditSellerPercent(
      deal.sellerCommissionPercent != null
        ? String(deal.sellerCommissionPercent)
        : deal.commissionPercent != null
          ? String(deal.commissionPercent)
          : !hasIncome && isSale
            ? "0.25"
            : "",
    );
    setEditBuyerPercent(deal.buyerCommissionPercent != null ? String(deal.buyerCommissionPercent) : !hasIncome && isSale ? "0.25" : "");
    setEditSellerAmount(
      deal.sellerCommissionToman ??
        deal.commissionToman ??
        (!hasIncome && isSale && deal.dealSalePriceToman ? (calcCommissionAmount(deal.dealSalePriceToman, "0.25") ?? "") : ""),
    );
    setEditBuyerAmount(
      deal.buyerCommissionToman ??
        (!hasIncome && isSale && deal.dealSalePriceToman ? (calcCommissionAmount(deal.dealSalePriceToman, "0.25") ?? "") : ""),
    );
    setEditSellerReceived(deal.sellerReceivedToman ?? "");
    setEditBuyerReceived(deal.buyerReceivedToman ?? "");
    setEditSellerShirini(deal.sellerShiriniToman ?? "");
    setEditBuyerShirini(deal.buyerShiriniToman ?? "");
    setEditSellerDiscount(deal.sellerDiscountToman ?? deal.discountToman ?? "");
    setEditBuyerDiscount(deal.buyerDiscountToman ?? "");
    setEditError("");
    // سهم‌بندی: اگر سهم واقعی دارد همان را بیاور؛ وگرنه پیش‌فرض دفتر ۵۰٪ + مشاور معامله ۵۰٪ —
    // چه کمیسیون داشته باشد چه هنوز «تعیین نشده» باشد؛ وگرنه با محاسبه خودکار مبلغ از روی
    // قیمت × درصد، بخش سهم‌بندی با دفتر ۵۰٪ تنها و هشدار مجموع ۵۰٪ باز می‌شد.
    // هر سهم دو درصد جدا دارد (کمیسیون و شیرینی)؛ خالیِ ذخیره‌شده یعنی همان درصد کمیسیون.
    const realShares = deal.shares.filter((s) => !s.virtual);
    if (realShares.length > 0) {
      setEditOfficePct(deal.officePct != null ? String(deal.officePct) : "50");
      setEditOfficeShiriniPct(
        deal.officeShiriniPct != null ? String(deal.officeShiriniPct) : deal.officePct != null ? String(deal.officePct) : "50",
      );
      setEditShares(
        realShares.map((s, i) => ({
          key: `s-${s.id ?? i}`,
          userId: s.userId,
          name: s.name,
          pct: String(s.pct),
          shiriniPct: s.shiriniPct != null ? String(s.shiriniPct) : String(s.pct),
          isExternal: s.isExternal,
        }))
      );
    } else {
      setEditOfficePct("50");
      setEditOfficeShiriniPct("50");
      setEditShares([{ key: "s-new-0", userId: deal.agent.id, name: deal.agent.name, pct: "50", shiriniPct: "50", isExternal: false }]);
    }
    // لیست کاربران برای انتخاب مشاور در سهم‌ها — موقع باز شدن صفحه لود شده؛
    // اگر خالی است (لود نشده یا خطا خورده) اینجا دوباره تلاش می‌شود.
    if (users.length === 0 && !usersLoading) void loadUsers();
  }

  // تقسیم مساوی خودکار — فقط پیش‌فرض است؛ درصد دستی تا وقتی ترکیب عوض نشود می‌ماند.
  // با اضافه/حذف سهم یا عوض شدن سهم دفتر دوباره مساوی تقسیم می‌شود؛ تایپ دستی درصد، بقیه را عوض نمی‌کند.
  // هر دو مبنا جدا مساوی تقسیم می‌شوند: کمیسیون از (۱۰۰ − سهم دفتر از کمیسیون) و شیرینی از (۱۰۰ − سهم دفتر از شیرینی).
  function resplitShares(officePctStr: string, officeShiriniPctStr: string, shares: EditShare[]): EditShare[] {
    const office = Number(toEnDigits(officePctStr).replace(/[^0-9.]/g, "")) || 0;
    const officeShirini = Number(toEnDigits(officeShiriniPctStr).replace(/[^0-9.]/g, "")) || 0;
    const pcts = equalSplit(office, shares.length);
    const shiriniPcts = equalSplit(officeShirini, shares.length);
    return shares.map((s, i) => ({ ...s, pct: String(pcts[i] ?? 0), shiriniPct: String(shiriniPcts[i] ?? 0) }));
  }

  function onEditOfficePct(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditOfficePct(clean);
    setEditShares((prev) => resplitShares(clean, editOfficeShiriniPct, prev));
  }

  function onEditOfficeShiriniPct(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditOfficeShiriniPct(clean);
    setEditShares((prev) => resplitShares(editOfficePct, clean, prev));
  }

  function addShareRow(isExternal: boolean) {
    setEditShares((prev) => {
      const next: EditShare[] = [...prev];
      if (isExternal) {
        next.push({ key: `s-new-${Date.now()}`, userId: null, name: "", pct: "0", shiriniPct: "0", isExternal: true });
      } else {
        const used = new Set(prev.map((s) => s.userId));
        // پیش‌فرض: مشاور خود معامله، اگر هنوز سهمی ندارد؛ وگرنه اولین مشاور آزاد
        const dealAgent =
          editingDeal && !used.has(editingDeal.agent.id) ? users.find((u) => u.id === editingDeal.agent.id) : undefined;
        const firstFree = dealAgent ?? users.find((u) => !used.has(u.id));
        next.push({
          key: `s-new-${Date.now()}`,
          userId: firstFree?.id ?? "",
          name: firstFree?.name ?? "",
          pct: "0",
          shiriniPct: "0",
          isExternal: false,
        });
      }
      return resplitShares(editOfficePct, editOfficeShiriniPct, next);
    });
  }

  function removeShareRow(key: string) {
    setEditShares((prev) => resplitShares(editOfficePct, editOfficeShiriniPct, prev.filter((s) => s.key !== key)));
  }

  function onSharePct(key: string, v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditShares((prev) => prev.map((s) => (s.key === key ? { ...s, pct: clean } : s)));
  }

  function onShareShiriniPct(key: string, v: string) {
    const clean = toEnDigits(v).replace(/[^0-9.]/g, "");
    setEditShares((prev) => prev.map((s) => (s.key === key ? { ...s, shiriniPct: clean } : s)));
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

  /** مجموع دو سهم‌بندی جدا: کمیسیون و شیرینی — هر دو باید دقیقاً ۱۰۰٪ شوند. */
  function sharesTotal(): { commission: number; shirini: number } {
    const office = Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, "")) || 0;
    const officeShirini = Number(toEnDigits(editOfficeShiriniPct).replace(/[^0-9.]/g, "")) || 0;
    return {
      commission: office + editShares.reduce((t, s) => t + (Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) || 0), 0),
      shirini: officeShirini + editShares.reduce((t, s) => t + (Number(toEnDigits(s.shiriniPct).replace(/[^0-9.]/g, "")) || 0), 0),
    };
  }

  // بنر خطای مجموع، زنده با هر ویرایش به‌روز می‌شود: وقتی هر دو مجموع درست شد پاک می‌شود،
  // و تا وقتی غلط است عدد تازه را نشان می‌دهد — نه عدد لحظه ذخیره.
  useEffect(() => {
    void (async () => {
      if (!editError.startsWith("مجموع سهم دفتر")) return;
      const total = sharesTotal();
      if (Math.abs(total.commission - 100) < 0.01 && Math.abs(total.shirini - 100) < 0.01) {
        setEditError("");
      } else {
        setEditError(
          `مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (کمیسیون الان ${toFaDigits(String(Math.round(total.commission * 100) / 100))}٪، شیرینی ${toFaDigits(String(Math.round(total.shirini * 100) / 100))}٪ است)`,
        );
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOfficePct, editOfficeShiriniPct, editShares]);

  // وقتی برای اولین بار مبلغ یا شیرینی یک طرف وارد می‌شود، سهم‌بندی با پیش‌فرض دفتر ۵۰٪ + مشاور معامله ۵۰٪ پر می‌شود
  function ensureSharesDefault() {
    if (editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", shiriniPct: "50", isExternal: false }]);
    }
  }

  function onEditSideAmount(side: "seller" | "buyer", v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    if (side === "seller") setEditSellerAmount(clean);
    else setEditBuyerAmount(clean);
    if (clean !== "") ensureSharesDefault();
  }

  // شیرینی‌ها مثل مبلغ کمیسیون‌اند: عدد فارسی تمیز می‌شود؛ با اولین ورود، سهم‌بندی پیش‌فرض پر می‌شود
  function onEditSellerShirini(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditSellerShirini(clean);
    if (clean !== "" && editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", shiriniPct: "50", isExternal: false }]);
    }
  }

  function onEditBuyerShirini(v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    setEditBuyerShirini(clean);
    if (clean !== "" && editShares.length === 0 && editingDeal && !editingDeal.shares.some((s) => !s.virtual)) {
      setEditShares([{ key: "s-new-0", userId: editingDeal.agent.id, name: editingDeal.agent.name, pct: "50", shiriniPct: "50", isExternal: false }]);
    }
  }

  // تخفیف هر طرف مثل شیرینی عدد تمیز می‌شود؛ از مبنای تقسیم کم می‌شود ولی از مالیات همان طرف کم نمی‌شود
  function onEditSideDiscount(side: "seller" | "buyer", v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    if (side === "seller") setEditSellerDiscount(clean);
    else setEditBuyerDiscount(clean);
  }

  // تقسیم خودکار دریافتی یک طرف: کمیسیون همان طرف (فروش: درصد همان طرف × قیمت
  // فروش — درصدِ تایپ‌شدهٔ همان طرف، نه پیش‌فرض؛ اجاره: فرمول رهن و اجاره) و
  // مالیات ۱۰٪ فقط روی همان کمیسیون؛ بقیهٔ دریافتی شیرینی همان طرف است و اگر
  // دریافتی کمتر از کمیسیون + مالیات باشد، کمبودش تخفیف همان طرف می‌شود
  // (مالیات همیشه روی کمیسیون کامل حساب می‌شود، تخفیف از مالیات کم نمی‌کند).
  // وارد کردن دریافتی هرگز درصد همان طرف را عوض نمی‌کند.
  // price/deposit/rent/percent تازه‌تایپ‌شده را می‌توان به‌عنوان override داد چون state هنوز به‌روز نشده است
  function applySideReceived(
    side: "seller" | "buyer",
    receivedStr: string,
    override?: { price?: string; deposit?: string; rent?: string; percent?: string },
  ) {
    if (!editingDeal) return;
    const received = Number(receivedStr);
    if (!Number.isFinite(received) || received <= 0) return;
    const isSale = editingDeal.property.dealType === "SALE";
    let split: { commission: number; vat: number; shirini: number; discount: number } | null = null;
    if (isSale) {
      const price = Number(override?.price ?? editPrice);
      if (!Number.isFinite(price) || price <= 0) return;
      const pctRaw = override?.percent ?? (side === "seller" ? editSellerPercent : editBuyerPercent);
      const pctNum = Number(pctRaw);
      const usePct =
        pctRaw !== "" && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100 ? pctNum : DEFAULT_SALE_COMMISSION_PCT;
      split = splitSaleSide(price, received, usePct);
      if (split.commission <= 0) return;
    } else {
      const dep = Number(override?.deposit ?? editDeposit);
      const rent = Number(override?.rent ?? editRent);
      if (!Number.isFinite(dep) || !Number.isFinite(rent)) return;
      split = splitRentSide(dep, rent, received);
      if (split.commission <= 0) return;
    }
    if (side === "seller") {
      setEditSellerAmount(String(split.commission));
      setEditSellerShirini(String(split.shirini));
      setEditSellerDiscount(String(split.discount));
    } else {
      setEditBuyerAmount(String(split.commission));
      setEditBuyerShirini(String(split.shirini));
      setEditBuyerDiscount(String(split.discount));
    }
    ensureSharesDefault();
  }

  function onEditSideReceived(side: "seller" | "buyer", v: string) {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    if (side === "seller") setEditSellerReceived(clean);
    else setEditBuyerReceived(clean);
    if (clean !== "") applySideReceived(side, clean);
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
      // اگر دریافتی یک طرف وارد شده، تقسیم همان طرف با درصد خودش دوباره حساب می‌شود؛
      // وگرنه مثل قبل درصد × قیمت برای هر طرف
      for (const side of ["seller", "buyer"] as const) {
        const received = side === "seller" ? editSellerReceived : editBuyerReceived;
        if (received !== "") {
          applySideReceived(side, received, { price: clean });
        } else {
          const pct = side === "seller" ? editSellerPercent : editBuyerPercent;
          const next = calcCommissionAmount(clean, pct);
          if (next !== null) {
            if (side === "seller") setEditSellerAmount(next);
            else setEditBuyerAmount(next);
          }
        }
      }
    }
  }

  // ودیعه/اجاره عوض شود، تقسیم دریافتی طرف‌هایی که دریافتی دارند دوباره حساب می‌شود
  function onEditDepositRent(v: string, which: "deposit" | "rent") {
    const clean = toEnDigits(v).replace(/[^0-9]/g, "");
    if (which === "deposit") setEditDeposit(clean);
    else setEditRent(clean);
    if (editingDeal?.property.dealType === "RENT") {
      for (const side of ["seller", "buyer"] as const) {
        const received = side === "seller" ? editSellerReceived : editBuyerReceived;
        if (received !== "") applySideReceived(side, received, which === "deposit" ? { deposit: clean } : { rent: clean });
      }
    }
  }

  function onEditSidePercent(side: "seller" | "buyer", v: string) {
    // اعشار قبول می‌کند (۰٫۲۵)؛ ممیز فارسی ٫ هم به نقطه تبدیل می‌شود؛ حداکثر ۲ رقم اعشار
    let clean = toEnDigits(v).replace(/٫/g, ".").replace(/[^0-9.]/g, "");
    const dot = clean.indexOf(".");
    if (dot !== -1) clean = clean.slice(0, dot + 1) + clean.slice(dot + 1).replace(/\./g, "").slice(0, 2);
    if (side === "seller") setEditSellerPercent(clean);
    else setEditBuyerPercent(clean);
    if (editingDeal?.property.dealType === "SALE") {
      const next = calcCommissionAmount(editPrice, clean);
      if (next !== null) {
        if (side === "seller") setEditSellerAmount(next);
        else setEditBuyerAmount(next);
      }
      // اگر دریافتی همان طرف وارد شده، با درصد تازه شیرینی/تخفیف هم دوباره حساب می‌شود
      const received = side === "seller" ? editSellerReceived : editBuyerReceived;
      if (received !== "") applySideReceived(side, received, { percent: clean });
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDeal) return;
    setEditError("");
    const isSaleForEdit = editingDeal.property.dealType === "SALE";
    if (isSaleForEdit) {
      for (const [label, v] of [
        [sideLabels("SALE").seller, editSellerPercent],
        [sideLabels("SALE").buyer, editBuyerPercent],
      ] as const) {
        if (v !== "") {
          const pct = Number(v);
          if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            setEditError(`درصد کمیسیون ${label} باید بین ۰ تا ۱۰۰ باشد`);
            return;
          }
        }
      }
    }
    // سهم‌بندی: هر درصد دستی قابل تغییر است؛ فقط هر دو مجموع باید دقیقاً ۱۰۰٪ شود
    const hasRealShares = editingDeal.shares.some((s) => !s.virtual);
    const sharesLocked = editingDeal.shares.some((s) => !s.virtual && s.settled);
    // درآمد قابل‌تقسیم (خالص) = کمیسیون دو طرف + هر دو شیرینی منهای تخفیف دو طرف؛ خالی یعنی صفر
    const editSellerAmountNum = Number(editSellerAmount) || 0;
    const editBuyerAmountNum = Number(editBuyerAmount) || 0;
    const editSellerDiscountNum = Number(editSellerDiscount) || 0;
    const editBuyerDiscountNum = Number(editBuyerDiscount) || 0;
    const editHasIncome =
      editSellerAmount !== "" || editBuyerAmount !== "" || editSellerShirini !== "" || editBuyerShirini !== "";
    const editTotal =
      editSellerAmountNum + editBuyerAmountNum + (Number(editSellerShirini) || 0) + (Number(editBuyerShirini) || 0);
    const editDiscountNum = editSellerDiscountNum + editBuyerDiscountNum;
    // تخفیف هر طرف نمی‌تواند بیشتر از کمیسیون همان طرف باشد (مالیات همیشه روی کمیسیون کامل است)
    if (editSellerDiscountNum > editSellerAmountNum) {
      setEditError("تخفیف فروشنده نمی‌تواند بیشتر از کمیسیون فروشنده باشد");
      return;
    }
    if (editBuyerDiscountNum > editBuyerAmountNum) {
      setEditError("تخفیف خریدار نمی‌تواند بیشتر از کمیسیون خریدار باشد");
      return;
    }
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
      shareBody = { officePct: 100, officeShiriniPct: 100, shares: [] };
    } else if (editHasIncome && !sharesLocked) {
      if (editNet <= 0) {
        setEditError("جمع خالص (کمیسیون و شیرینی منهای تخفیف) باید بیشتر از صفر باشد");
        return;
      }
      const office = Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(office) || office < 0 || office > 100) {
        setEditError("سهم دفتر از کمیسیون باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
      const officeShirini = Number(toEnDigits(editOfficeShiriniPct).replace(/[^0-9.]/g, ""));
      if (!Number.isFinite(officeShirini) || officeShirini < 0 || officeShirini > 100) {
        setEditError("سهم دفتر از شیرینی باید بین ۰ تا ۱۰۰ باشد");
        return;
      }
      if (editShares.length === 0 && (office < 100 || officeShirini < 100)) {
        setEditError("مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود");
        return;
      }
      const total = sharesTotal();
      if (Math.abs(total.commission - 100) >= 0.01 || Math.abs(total.shirini - 100) >= 0.01) {
        setEditError(
          `مجموع سهم دفتر و سهم‌ها باید دقیقاً ۱۰۰٪ شود (کمیسیون الان ${toFaDigits(String(Math.round(total.commission * 100) / 100))}٪، شیرینی ${toFaDigits(String(Math.round(total.shirini * 100) / 100))}٪ است)`,
        );
        return;
      }
      const seen = new Set<string>();
      for (const s of editShares) {
        const pct = Number(toEnDigits(s.pct).replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          setEditError("درصد سهم هر مشاور باید بیشتر از صفر و حداکثر ۱۰۰ باشد");
          return;
        }
        const shiriniPct = Number(toEnDigits(s.shiriniPct).replace(/[^0-9.]/g, ""));
        if (!Number.isFinite(shiriniPct) || shiriniPct < 0 || shiriniPct > 100) {
          setEditError("درصد شیرینی هر سهم باید بین ۰ تا ۱۰۰ باشد");
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
        officeShiriniPct: officeShirini,
        shares: editShares.map((s) =>
          s.isExternal
            ? {
                name: s.name.trim(),
                pct: Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")),
                shiriniPct: Number(toEnDigits(s.shiriniPct).replace(/[^0-9.]/g, "")),
              }
            : {
                userId: s.userId,
                pct: Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")),
                shiriniPct: Number(toEnDigits(s.shiriniPct).replace(/[^0-9.]/g, "")),
              }
        ),
      };
    }
    setEditSaving(true);
    try {
      const isSale = editingDeal.property.dealType === "SALE";
      const money = (v: string): string | null => (v === "" ? null : toEnDigits(v).replace(/[^0-9]/g, ""));
      const body: Record<string, unknown> = {
        sellerCommissionToman: money(editSellerAmount),
        sellerCommissionPercent: !isSale || editSellerPercent === "" ? null : Number(editSellerPercent),
        buyerCommissionToman: money(editBuyerAmount),
        buyerCommissionPercent: !isSale || editBuyerPercent === "" ? null : Number(editBuyerPercent),
        sellerReceivedToman: money(editSellerReceived),
        buyerReceivedToman: money(editBuyerReceived),
        sellerShiriniToman: money(editSellerShirini),
        buyerShiriniToman: money(editBuyerShirini),
        // بدون درآمد، تخفیف هم معنا ندارد و پاک می‌شود (مثل سهم‌بندی)
        sellerDiscountToman: !editHasIncome ? null : money(editSellerDiscount),
        buyerDiscountToman: !editHasIncome ? null : money(editBuyerDiscount),
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

  // نرخ مالیات ارزش افزوده از خلاصه می‌آید؛ تا پیش از بارگذاری، پیش‌فرض
  const taxRate = summary?.taxRatePct ?? DEFAULT_TAX_RATE_PCT;

  // مبلغ‌های فرم ویرایش — هر طرف جدا (خالی یعنی صفر)
  const editSellerAmountNum = Number(editSellerAmount) || 0;
  const editBuyerAmountNum = Number(editBuyerAmount) || 0;
  const editCommissionTotal = editSellerAmountNum + editBuyerAmountNum;
  const editShiriniTotal = (Number(editSellerShirini) || 0) + (Number(editBuyerShirini) || 0);
  const editDiscountTotal = (Number(editSellerDiscount) || 0) + (Number(editBuyerDiscount) || 0);
  const editSellerVat = Math.round((editSellerAmountNum * taxRate) / 100);
  const editBuyerVat = Math.round((editBuyerAmountNum * taxRate) / 100);

  // مبنای پیش‌نمایش سهم‌بندی در فرم ویرایش: کمیسیون دو طرف + هر دو شیرینی منهای تخفیف دو طرف
  const editSplitBase = editCommissionTotal + editShiriniTotal - editDiscountTotal;
  // دو مبنای مستقل تقسیم در پیش‌نمایش — مثل سرور: تخفیف اول از کمیسیون کم می‌شود،
  // اضافه‌اش از شیرینی؛ جمعشان دقیقاً مبنای تقسیم است.
  const editCommissionPool = Math.max(0, editCommissionTotal - editDiscountTotal);
  const editShiriniPool = Math.max(0, editShiriniTotal - Math.max(0, editDiscountTotal - editCommissionTotal));

  // جمع ناخالص (کمیسیون + هر دو شیرینی) و خطاهای زنده تخفیف: تخفیف بیشتر از جمع ناخالص
  // همان خطای سرور است، ولی همان‌جا در فرم نشان داده می‌شود و ذخیره قفل می‌شود؛
  // چون از state مشتق شده، با برگشتن تخفیف به حد مجاز خودش پاک می‌شود.
  const editGross = editCommissionTotal + editShiriniTotal;
  const editDiscountOverGross = editDiscountTotal > editGross;
  const editSellerDiscountOver = (Number(editSellerDiscount) || 0) > editSellerAmountNum;
  const editBuyerDiscountOver = (Number(editBuyerDiscount) || 0) > editBuyerAmountNum;

  /** مالیات ارزش افزوده یک معامله = نرخ × کمیسیون کل (ناخالص) — شیرینی و تخفیف در آن نیستند. */
  const taxOf = (d: Pick<CommissionDeal, "commissionToman" | "sellerCommissionToman" | "buyerCommissionToman">): number => {
    return Math.round((Number(dealTotalCommission(d)) * taxRate) / 100);
  };

  /** مالیات فرم ویرایش روی کمیسیون کل فعلی حساب می‌شود (نه روی مبنای خالص). */
  const editTax = editSellerVat + editBuyerVat;

  /** تفکیک سهم به کمیسیون و شیرینی در پیش‌نمایش فرم ویرایش — مثل سرور: دو درصد
   *  جدا روی دو مبنای مستقل؛ وقتی درصد شیرینی برابر درصد کمیسیون است، مبلغ
   *  دقیقاً مثل قبل روی مبنای کل حساب می‌شود. */
  function editShareParts(pct: number, shiriniPct: number): { amount: number; commission: number; shirini: number } {
    const commission = Math.round((editCommissionPool * pct) / 100);
    if (shiriniPct === pct) {
      const amount = editSplitBase <= 0 ? 0 : Math.round((editSplitBase * pct) / 100);
      return { amount, commission, shirini: amount - commission };
    }
    const shirini = Math.round((editShiriniPool * shiriniPct) / 100);
    return { amount: commission + shirini, commission, shirini };
  }

  const editOfficePctNum = Number(toEnDigits(editOfficePct).replace(/[^0-9.]/g, "")) || 0;
  const editOfficeShiriniPctNum = Number(toEnDigits(editOfficeShiriniPct).replace(/[^0-9.]/g, "")) || 0;
  const editOfficeParts = editShareParts(editOfficePctNum, editOfficeShiriniPctNum);

  /** فرم یک طرف معامله در مودال ویرایش: دریافتی، درصد و مبلغ کمیسیون، شیرینی و تخفیف همان طرف. */
  function renderSideForm(side: "seller" | "buyer") {
    const labels = editingDeal ? sideLabels(editingDeal.property.dealType) : { seller: "فروشنده", buyer: "خریدار" };
    const label = side === "seller" ? labels.seller : labels.buyer;
    const isSale = editingDeal?.property.dealType === "SALE";
    const received = side === "seller" ? editSellerReceived : editBuyerReceived;
    const percent = side === "seller" ? editSellerPercent : editBuyerPercent;
    const amount = side === "seller" ? editSellerAmount : editBuyerAmount;
    const shirini = side === "seller" ? editSellerShirini : editBuyerShirini;
    const discount = side === "seller" ? editSellerDiscount : editBuyerDiscount;
    const split = sideReceivedSplit(side);
    const discountOver = side === "seller" ? editSellerDiscountOver : editBuyerDiscountOver;
    const amountNum = side === "seller" ? editSellerAmountNum : editBuyerAmountNum;
    const vat = side === "seller" ? editSellerVat : editBuyerVat;
    return (
      <div className="rounded-[12px] border border-[var(--line)] bg-[#fafcfe] p-3 space-y-3">
        <b className="text-[13px]">طرف {label}</b>
        <MoneyInput
          label={`دریافتی از ${label} (تومان)`}
          value={received}
          onChange={(v) => onEditSideReceived(side, v)}
          placeholder="مثلا ۵۰۰۰۰۰۰۰"
          hint={`مبلغ دریافتی از ${label} را بزنید؛ کمیسیون، مالیات و شیرینی ${label} خودکار پر می‌شود`}
        />
        {split && split.commission > 0 && (
          <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
            <div>دریافتی: {formatToman(received)}</div>
            <div>
              کمیسیون
              {isSale ? ` (${toFaDigits(percent !== "" ? percent : String(DEFAULT_SALE_COMMISSION_PCT))}٪ قیمت فروش)` : ""}:{" "}
              {formatToman(split.commission)}
            </div>
            <div>مالیات ارزش افزوده (۱۰٪ کمیسیون): {formatToman(split.vat)}</div>
            <div>شیرینی (بقیه دریافتی): {formatToman(split.shirini)}</div>
            {split.discount > 0 && <div>تخفیف (کمبود دریافتی نسبت به کمیسیون + مالیات): {formatToman(split.discount)}</div>}
          </div>
        )}
        {isSale && (
          <div>
            <Label htmlFor={`f-editPercent-${side}`}>درصد کمیسیون {label} (۰ تا ۱۰۰)</Label>
            <NumberInput
              id={`f-editPercent-${side}`}
              className="mt-1"
              value={percent}
              onChange={(e) => onEditSidePercent(side, e.target.value)}
              placeholder="مثلا ۰٫۲۵"
              allowDecimal
            />
          </div>
        )}
        <MoneyInput
          label={`مبلغ کمیسیون ${label} (تومان)`}
          value={amount}
          onChange={(v) => onEditSideAmount(side, v)}
          placeholder="مثلا ۲۸۷۵۰۰۰۰"
          hint="خالی بماند یعنی بدون کمیسیون"
        />
        <MoneyInput
          label={`شیرینی ${label} (تومان)`}
          value={shirini}
          onChange={(v) => (side === "seller" ? onEditSellerShirini(v) : onEditBuyerShirini(v))}
          placeholder="مثلا ۱۰۰۰۰۰۰۰"
          hint="اختیاری — خالی یعنی صفر"
        />
        <MoneyInput
          label={`تخفیف ${label} (تومان)`}
          value={discount}
          onChange={(v) => onEditSideDiscount(side, v)}
          placeholder="مثلا ۲۰۰۰۰۰۰"
          hint="اختیاری — خالی یعنی صفر؛ از کمیسیون همان طرف کم می‌شود ولی از مالیات آن کم نمی‌شود"
        />
        {discountOver && <p className="text-[12px] text-red-700">تخفیف {label} نمی‌تواند بیشتر از کمیسیون {label} باشد</p>}
        {amountNum > 0 && (
          <p className="text-[11px] text-[var(--ink-3)]">
            مالیات {label} ({toFaDigits(String(taxRate))}٪ روی کمیسیون): {formatToman(vat)}
          </p>
        )}
      </div>
    );
  }

  /** تقسیم زندهٔ دریافتی یک طرف در فرم ویرایش — وقتی قیمت/ودیعه و دریافتی همان طرف وارد شده‌اند. */
  function sideReceivedSplit(side: "seller" | "buyer"): { commission: number; vat: number; shirini: number; discount: number } | null {
    if (!editingDeal) return null;
    const received = Number(side === "seller" ? editSellerReceived : editBuyerReceived);
    if (!Number.isFinite(received) || received <= 0) return null;
    if (editingDeal.property.dealType === "SALE") {
      const price = Number(editPrice);
      if (!Number.isFinite(price) || price <= 0) return null;
      const pctRaw = side === "seller" ? editSellerPercent : editBuyerPercent;
      const pctNum = Number(pctRaw);
      const usePct =
        pctRaw !== "" && Number.isFinite(pctNum) && pctNum >= 0 && pctNum <= 100 ? pctNum : DEFAULT_SALE_COMMISSION_PCT;
      return splitSaleSide(price, received, usePct);
    }
    const dep = Number(editDeposit);
    const rent = Number(editRent);
    if (!Number.isFinite(dep) || !Number.isFinite(rent)) return null;
    return splitRentSide(dep, rent, received);
  }

  /** جزئیات پیش‌نمایش کمیسیون — فقط از مقادیر ذخیره‌شده خوانده می‌شود؛ چیزی ذخیره نمی‌کند. */
  const previewTotalCommission = previewDeal ? Number(dealTotalCommission(previewDeal)) : 0;
  const previewSellerCommission = previewDeal ? Number(bigNum(previewDeal.sellerCommissionToman)) : 0;
  const previewBuyerCommission = previewDeal ? Number(bigNum(previewDeal.buyerCommissionToman)) : 0;
  const previewHasSides = previewDeal ? dealHasSides(previewDeal) : false;
  const previewSellerShirini = previewDeal ? Number(previewDeal.sellerShiriniToman) || 0 : 0;
  const previewBuyerShirini = previewDeal ? Number(previewDeal.buyerShiriniToman) || 0 : 0;
  const previewDiscountTotal = previewDeal ? Number(dealTotalDiscount(previewDeal)) : 0;
  const previewSellerDiscount = previewDeal ? Number(previewDeal.sellerDiscountToman) || 0 : 0;
  const previewBuyerDiscount = previewDeal ? Number(previewDeal.buyerDiscountToman) || 0 : 0;
  const previewSellerVat = Math.round((previewSellerCommission * taxRate) / 100);
  const previewBuyerVat = Math.round((previewBuyerCommission * taxRate) / 100);
  const previewTax = Math.round((previewTotalCommission * taxRate) / 100);
  const previewTotal = previewTotalCommission + previewSellerShirini + previewBuyerShirini - previewDiscountTotal + previewTax;
  const previewSellerTotal = previewSellerCommission + previewSellerShirini - previewSellerDiscount + previewSellerVat;
  const previewBuyerTotal = previewBuyerCommission + previewBuyerShirini - previewBuyerDiscount + previewBuyerVat;
  const previewSellerReceived = previewDeal ? Number(bigNum(previewDeal.sellerReceivedToman)) : 0;
  const previewBuyerReceived = previewDeal ? Number(bigNum(previewDeal.buyerReceivedToman)) : 0;
  // دریافتی نقدی فقط وقتی «دریافت شد» زده شده است؛ مبلغ‌های توافقی هر طرف
  // (دریافتی از فروشنده/خریدار) پولِ گرفته‌شده نیستند — فقط در خط‌های جداگانه
  // نشان داده می‌شوند و روی دریافتی کل یا مانده اثر نمی‌گذارند.
  const previewReceived = previewDeal?.commissionPaid ? previewTotal : 0;
  const previewOutstanding = previewTotal - previewReceived;

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
                  {summary.officeCommissionTotal != null && summary.officeShiriniTotal != null && (
                    <div className="text-[12px] text-[var(--ink-3)]">
                      کمیسیون {formatToman(summary.officeCommissionTotal)} · شیرینی {formatToman(summary.officeShiriniTotal)}
                    </div>
                  )}
                </div>
                <div className="rounded-[12px] border border-[var(--line)] bg-white px-3 py-2">
                  <div className="text-[11px] text-[var(--ink-3)]">بدهی به مشاوران</div>
                  <div className="text-[20px] font-extrabold text-red-600">{formatToman(summary.debtToAgents)}</div>
                  <div className="text-[12px] text-[var(--ink-3)]">سهم‌های تسویه‌نشده</div>
                  {summary.debtToAgentsCommission != null && summary.debtToAgentsShirini != null && (
                    <div className="text-[12px] text-[var(--ink-3)]">
                      کمیسیون {formatToman(summary.debtToAgentsCommission)} · شیرینی {formatToman(summary.debtToAgentsShirini)}
                    </div>
                  )}
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
                              {formatToman(dealTotalCommission(d))}
                              {dealHasSides(d) ? (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">
                                  {sideLabels(d.property.dealType).seller} {formatToman(d.sellerCommissionToman)}
                                  {" · "}
                                  {sideLabels(d.property.dealType).buyer} {formatToman(d.buyerCommissionToman)}
                                </span>
                              ) : (
                                d.commissionPercent != null && (
                                  <span className="block text-[12px] font-normal text-[var(--ink-3)]">{toFaDigits(String(d.commissionPercent))}٪</span>
                                )
                              )}
                              {shiriniParts(d, d.property.dealType).length > 0 && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">{shiriniParts(d, d.property.dealType).join(" · ")}</span>
                              )}
                              {dealTotalDiscount(d) > BigInt(0) && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">تخفیف {formatToman(dealTotalDiscount(d))}</span>
                              )}
                              {taxOf(d) > 0 && (
                                <span className="block text-[12px] font-normal text-[var(--ink-3)]">مالیات ({toFaDigits(String(taxRate))}٪) {formatToman(taxOf(d))}</span>
                              )}
                              {!isOwner &&
                                d.shares.map((s) => (
                                  <span key={s.id ?? s.name} className="block text-[12px] font-normal text-[var(--ink-3)]">
                                    سهم من: {toFaDigits(String(s.pct))}٪ کمیسیون · {toFaDigits(String(s.shiriniPct))}٪ شیرینی · {formatToman(s.amount)}
                                    <span className="block text-[11px]">
                                      کمیسیون {formatToman(s.commissionAmount)} · شیرینی {formatToman(s.shiriniAmount)}
                                    </span>
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
                                  دفتر {toFaDigits(String(d.officePct ?? 0))}٪ کمیسیون
                                  {d.officeShiriniPct != null && d.officeShiriniPct !== d.officePct ? ` · ${toFaDigits(String(d.officeShiriniPct))}٪ شیرینی` : ""} · {formatToman(d.officeAmount)}
                                  <span className="block text-[11px] text-[var(--ink-3)]">
                                    کمیسیون {formatToman(d.officeCommissionAmount)} · شیرینی {formatToman(d.officeShiriniAmount)}
                                  </span>
                                </div>
                                {d.shares.map((s) => (
                                  <div key={s.id ?? s.name} className="flex items-center justify-between gap-1.5">
                                    <span>
                                      {s.isExternal ? `تعاون: ${s.name}` : s.name} {toFaDigits(String(s.pct))}٪ کمیسیون · {toFaDigits(String(s.shiriniPct))}٪ شیرینی · {formatToman(s.amount)}
                                      <span className="block text-[11px] text-[var(--ink-3)]">
                                        کمیسیون {formatToman(s.commissionAmount)} · شیرینی {formatToman(s.shiriniAmount)}
                                      </span>
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
                          {isOwner && tab === "commissions" && (
                            <div className="mt-1">
                              <Button size="sm" variant="outline" onClick={() => setPreviewDeal(d)}>
                                جزئیات
                              </Button>
                            </div>
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
              کمیسیون و مالیات هر معامله از هر دو طرف گرفته می‌شود (فروش: فروشنده و خریدار؛ اجاره: مالک و مستاجر) و هر طرف جدا ثبت می‌شود؛
              قیمت، کمیسیون و شیرینی هر معامله را مدیر در همین‌جا نهایی می‌کند؛ تا پیش از تسویه قابل ویرایش است و پس از تسویه قفل می‌شود. سهم‌بندی
              (دفتر، مشاوران و تعاون) روی جمع خالص (کمیسیون دو طرف و شیرینی منهای تخفیف) انجام می‌شود و هر سهم جداگانه تسویه می‌شود؛
              مبلغ هر سهم به کمیسیون و شیرینی تفکیک می‌شود.
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
                        <td className="text-center font-bold">
                          {formatToman(u.commissionTotal)}
                          <span className="block text-[11px] font-normal text-[var(--ink-3)]">
                            کمیسیون {formatToman(u.commissionPart)} · شیرینی {formatToman(u.shiriniPart)}
                          </span>
                        </td>
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
                      <td className="text-center">
                        {formatToman(agents.totals.commissionTotal)}
                        <span className="block text-[11px] font-normal text-[var(--ink-3)]">
                          کمیسیون {formatToman(agents.totals.commissionPart)} · شیرینی {formatToman(agents.totals.shiriniPart)}
                        </span>
                      </td>
                      <td className="text-center">{formatToman(agents.totals.commissionPaid)}</td>
                      <td className="text-center">{formatToman(agents.totals.commissionUnpaid)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[12px] text-[var(--ink-3)]">
                سهم دفتر: {formatToman(agents.totals.officeTotal)} (کمیسیون {formatToman(agents.totals.officeCommissionTotal)} · شیرینی{" "}
                {formatToman(agents.totals.officeShiriniTotal)}) · تعاون (بیرونی): {formatToman(agents.totals.externalTotal)} (کمیسیون{" "}
                {formatToman(agents.totals.externalCommissionTotal)} · شیرینی {formatToman(agents.totals.externalShiriniTotal)}) · جمع کل درآمد (کمیسیون +{" "}
                شیرینی − تخفیف): {formatToman(agents.totals.commissionGrandTotal)} (کمیسیون {formatToman(agents.totals.grandTotalCommission)} · شیرینی{" "}
                {formatToman(agents.totals.grandTotalShirini)})
              </p>
              </>
            ) : null}
          </Card>
        )}

        {editingDeal && (
          <Modal
            onClose={() => setEditingDeal(null)}
            ariaLabel={!dealHasIncome(editingDeal) ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
          >
              <h3 className="text-[15px] font-extrabold">
                {!dealHasIncome(editingDeal) ? "تعیین کمیسیون" : "ویرایش قیمت و کمیسیون"}
              </h3>
              <p className="mt-1 text-[12px] text-[var(--ink-3)]">
                {editingDeal.property.title} · {editingDeal.customer.name} · {DEAL_TYPE[editingDeal.property.dealType] ?? editingDeal.property.dealType}
              </p>
              <form onSubmit={saveEdit} className="mt-4 space-y-3">
                {editingDeal.property.dealType === "SALE" ? (
                  <>
                    <MoneyInput
                      label="قیمت فروش معامله (تومان)"
                      value={editPrice}
                      onChange={onEditPrice}
                      placeholder="مثلا ۱۰۰۰۰۰۰۰۰۰۰"
                    />
                    {editingDeal.property.salePriceToman ? (
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">قیمت فایل: {formatToman(editingDeal.property.salePriceToman)}</p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <MoneyInput
                      label="ودیعه معامله (تومان)"
                      value={editDeposit}
                      onChange={(v) => onEditDepositRent(v, "deposit")}
                      placeholder="مثلا ۵۰۰۰۰۰۰۰۰"
                    />
                    {editingDeal.property.depositToman ? (
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">ودیعه فایل: {formatToman(editingDeal.property.depositToman)}</p>
                    ) : null}
                    <MoneyInput
                      label="اجاره ماهانه (تومان)"
                      value={editRent}
                      onChange={(v) => onEditDepositRent(v, "rent")}
                      placeholder="مثلا ۲۰۰۰۰۰۰۰"
                    />
                    {editingDeal.property.monthlyRentToman ? (
                      <p className="mt-1 text-[11px] text-[var(--ink-3)]">اجاره ماهانه فایل: {formatToman(editingDeal.property.monthlyRentToman)}</p>
                    ) : null}
                  </>
                )}
                {renderSideForm("seller")}
                {renderSideForm("buyer")}
                {editDiscountOverGross && (
                  <p className="text-[12px] text-red-700">تخفیف نمی‌تواند بیشتر از جمع کمیسیون و شیرینی باشد</p>
                )}
                <p className="text-[11px] text-[var(--ink-3)]">
                  {editingDeal.property.dealType === "SALE"
                    ? "مبلغ هر طرف از روی درصد همان طرف × قیمت فروش حساب می‌شود؛ می‌توانید دستی هم عوضش کنید."
                    : "برای اجاره مبلغ کمیسیون هر طرف از فرمول (ودیعه × ۳٪ + اجاره) ÷ ۴ حساب می‌شود؛ می‌توانید دستی هم عوضش کنید."}
                </p>
                <p className="text-[11px] text-[var(--ink-3)]">
                  کمیسیون و مالیات از هر دو طرف گرفته می‌شود و هر طرف جدا ثبت می‌شود؛ شیرینی با کمیسیون جمع می‌شود و با همان سهم‌بندی تقسیم می‌شود.
                </p>
                {(editSplitBase > 0 || editTax > 0) && !editDiscountOverGross && !editSellerDiscountOver && !editBuyerDiscountOver && (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
                    <div>
                      کمیسیون {sideLabels(editingDeal.property.dealType).seller}: {formatToman(editSellerAmountNum)}
                      {editSellerVat > 0 && ` · مالیات: ${formatToman(editSellerVat)}`}
                      {(Number(editSellerShirini) || 0) > 0 && ` · شیرینی: ${formatToman(editSellerShirini)}`}
                      {(Number(editSellerDiscount) || 0) > 0 && ` · تخفیف: ${formatToman(editSellerDiscount)}`}
                    </div>
                    <div>
                      کمیسیون {sideLabels(editingDeal.property.dealType).buyer}: {formatToman(editBuyerAmountNum)}
                      {editBuyerVat > 0 && ` · مالیات: ${formatToman(editBuyerVat)}`}
                      {(Number(editBuyerShirini) || 0) > 0 && ` · شیرینی: ${formatToman(editBuyerShirini)}`}
                      {(Number(editBuyerDiscount) || 0) > 0 && ` · تخفیف: ${formatToman(editBuyerDiscount)}`}
                    </div>
                    <div>بدون مالیات (کمیسیون + شیرینی − تخفیف): {formatToman(editSplitBase)}</div>
                    <div>مالیات ارزش افزوده ({toFaDigits(String(taxRate))}٪ روی کمیسیون): {formatToman(editTax)}</div>
                    <div className="font-bold">با مالیات — جمع دریافتی از مشتری: {formatToman(editSplitBase + editTax)}</div>
                    <div className="text-[11px] text-[var(--ink-3)]">مالیات فقط روی کمیسیون حساب می‌شود و جزو تقسیم درآمد نیست؛ از کمیسیون کم نمی‌شود، به مبلغ دریافتی از مشتری اضافه می‌شود.</div>
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
                      <div>
                        دفتر {toFaDigits(String(editingDeal.officePct ?? 0))}٪ کمیسیون ·{" "}
                        {toFaDigits(String(editingDeal.officeShiriniPct ?? editingDeal.officePct ?? 0))}٪ شیرینی
                      </div>
                      {editingDeal.shares
                        .filter((s) => !s.virtual)
                        .map((s) => (
                          <div key={s.id ?? s.name}>
                            {s.isExternal ? `تعاون: ${s.name}` : s.name} {toFaDigits(String(s.pct))}٪ کمیسیون · {toFaDigits(String(s.shiriniPct))}٪ شیرینی
                            {s.settled ? " · تسویه شد" : ""}
                          </div>
                        ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[12px] border border-[var(--line)] bg-[#fafcfe] p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <b className="text-[13px]">👥 سهم‌بندی کمیسیون و شیرینی</b>
                      {(() => {
                        const t = sharesTotal();
                        const okC = Math.abs(t.commission - 100) < 0.01;
                        const okS = Math.abs(t.shirini - 100) < 0.01;
                        return (
                          <span className={okC && okS ? "text-[12px] text-emerald-600 font-bold" : "text-[12px] text-red-600 font-bold"}>
                            {okC && okS
                              ? "✓ هر دو مجموع ۱۰۰٪ است"
                              : `⚠ مجموع کمیسیون ${toFaDigits(String(Math.round(t.commission * 100) / 100))}٪ · شیرینی ${toFaDigits(String(Math.round(t.shirini * 100) / 100))}٪ — هر دو باید ۱۰۰٪ شوند`}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-[13px]">
                        سهم دفتر از کمیسیون ٪
                        <input
                          className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                          inputMode="decimal"
                          value={editOfficePct}
                          onChange={(e) => onEditOfficePct(e.target.value)}
                        />
                      </label>
                      <label className="block text-[13px]">
                        سهم دفتر از شیرینی ٪
                        <input
                          className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                          inputMode="decimal"
                          value={editOfficeShiriniPct}
                          onChange={(e) => onEditOfficeShiriniPct(e.target.value)}
                        />
                      </label>
                      <div className="col-span-2 text-[13px]">
                        مبلغ سهم دفتر
                        <div className="mt-1 rounded-[10px] border border-[var(--line)] bg-white px-3 py-2 text-[14px]">
                          {formatToman(editSplitBase <= 0 ? null : String(editOfficeParts.amount))}
                        </div>
                        {editSplitBase > 0 && (
                          <div className="mt-1 text-[11px] text-[var(--ink-3)]">
                            کمیسیون {formatToman(editOfficeParts.commission)} · شیرینی {formatToman(editOfficeParts.shirini)}
                          </div>
                        )}
                      </div>
                    </div>
                    {usersError && (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                        لیست مشاورها بارگذاری نشد ({usersError}){" "}
                        <button type="button" className="font-bold underline" onClick={() => void loadUsers()}>
                          تلاش دوباره
                        </button>
                      </div>
                    )}
                    <div className="space-y-2">
                      {editShares.map((s) => {
                        const parts = editShareParts(
                          Number(toEnDigits(s.pct).replace(/[^0-9.]/g, "")) || 0,
                          Number(toEnDigits(s.shiriniPct).replace(/[^0-9.]/g, "")) || 0,
                        );
                        return (
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
                                {usersLoading && <option value="" disabled>در حال بارگذاری…</option>}
                                {users.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <label className="block w-[90px] text-[13px]">
                            سهم از کمیسیون ٪
                            <input
                              className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                              inputMode="decimal"
                              value={s.pct}
                              onChange={(e) => onSharePct(s.key, e.target.value)}
                            />
                          </label>
                          <label className="block w-[90px] text-[13px]">
                            سهم از شیرینی ٪
                            <input
                              className="mt-1 w-full rounded-[10px] border border-[var(--line)] px-3 py-2 text-[14px]"
                              inputMode="decimal"
                              value={s.shiriniPct}
                              onChange={(e) => onShareShiriniPct(s.key, e.target.value)}
                            />
                          </label>
                          <span className="pb-2 text-[12px] text-[var(--ink-3)]">
                            {formatToman(editSplitBase <= 0 ? null : String(parts.amount))}
                            <span className="block text-[11px]">
                              کمیسیون {formatToman(parts.commission)} · شیرینی {formatToman(parts.shirini)}
                            </span>
                          </span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removeShareRow(s.key)} aria-label="حذف سهم">
                            ✕
                          </Button>
                        </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => addShareRow(false)} disabled={usersLoading}>
                        {usersLoading ? "در حال بارگذاری…" : "＋ افزودن مشاور"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => addShareRow(true)}>
                        ＋ افزودن همکار بیرونی (تعاون)
                      </Button>
                    </div>
                    <p className="text-[11px] text-[var(--ink-3)]">
                      کمیسیون و شیرینی دو مبنای جدا دارند و هر کدام باید جدا به ۱۰۰٪ برسد؛ با اضافه یا حذف سهم، یا با عوض شدن سهم دفتر، هر دو سهم خودکار
                      مساوی تقسیم می‌شوند؛ هر درصد را می‌توانید دستی هم عوض کنید و تا وقتی ترکیب عوض نشود می‌ماند.
                    </p>
                  </div>
                )}
                {editError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>}
                <div className="flex gap-2 pt-1">
                  <Button type="submit" disabled={editSaving || editDiscountOverGross || editSellerDiscountOver || editBuyerDiscountOver}>
                    {editSaving ? "در حال ذخیره..." : "ذخیره"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setEditingDeal(null)} disabled={editSaving}>
                    انصراف
                  </Button>
                </div>
              </form>
          </Modal>
        )}

        {previewDeal && (
          <Modal onClose={() => setPreviewDeal(null)} ariaLabel="جزئیات کمیسیون">
            <h3 className="text-[15px] font-extrabold">جزئیات کمیسیون</h3>
            <p className="mt-1 text-[12px] text-[var(--ink-3)]">
              {previewDeal.property.title} · {previewDeal.customer.name} · {DEAL_TYPE[previewDeal.property.dealType] ?? previewDeal.property.dealType}
            </p>
            {!dealHasIncome(previewDeal) ? (
              <p className="mt-4 text-[13px] text-[var(--ink-3)]">برای این معامله هنوز کمیسیون تعیین نشده است.</p>
            ) : (
              <div className="mt-4 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
                <div>
                  قیمت معامله:{" "}
                  {previewDeal.property.dealType === "SALE"
                    ? formatToman(previewDeal.dealSalePriceToman)
                    : `${formatToman(previewDeal.dealDepositToman)} · اجاره ماهانه ${formatToman(previewDeal.dealMonthlyRentToman)}`}
                </div>
                {previewHasSides ? (
                  <>
                    <div>
                      کمیسیون {sideLabels(previewDeal.property.dealType).seller}
                      {previewDeal.sellerCommissionPercent != null ? ` (${toFaDigits(String(previewDeal.sellerCommissionPercent))}٪)` : ""}:{" "}
                      {formatToman(previewSellerCommission)} · مالیات: {formatToman(previewSellerVat)}
                    </div>
                    <div>
                      کمیسیون {sideLabels(previewDeal.property.dealType).buyer}
                      {previewDeal.buyerCommissionPercent != null ? ` (${toFaDigits(String(previewDeal.buyerCommissionPercent))}٪)` : ""}:{" "}
                      {formatToman(previewBuyerCommission)} · مالیات: {formatToman(previewBuyerVat)}
                    </div>
                    {previewSellerShirini > 0 && (
                      <div>شیرینی {sideLabels(previewDeal.property.dealType).seller}: {formatToman(previewDeal.sellerShiriniToman)}</div>
                    )}
                    {previewBuyerShirini > 0 && (
                      <div>شیرینی {sideLabels(previewDeal.property.dealType).buyer}: {formatToman(previewDeal.buyerShiriniToman)}</div>
                    )}
                    {previewSellerDiscount > 0 && (
                      <div>تخفیف {sideLabels(previewDeal.property.dealType).seller}: {formatToman(previewDeal.sellerDiscountToman)}</div>
                    )}
                    {previewBuyerDiscount > 0 && (
                      <div>تخفیف {sideLabels(previewDeal.property.dealType).buyer}: {formatToman(previewDeal.buyerDiscountToman)}</div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      کمیسیون{previewDeal.commissionPercent != null ? ` (${toFaDigits(String(previewDeal.commissionPercent))}٪)` : ""}:{" "}
                      {formatToman(previewDeal.commissionToman)}
                    </div>
                    {previewSellerShirini > 0 && (
                      <div>شیرینی {sideLabels(previewDeal.property.dealType).seller}: {formatToman(previewDeal.sellerShiriniToman)}</div>
                    )}
                    {previewBuyerShirini > 0 && (
                      <div>شیرینی {sideLabels(previewDeal.property.dealType).buyer}: {formatToman(previewDeal.buyerShiriniToman)}</div>
                    )}
                    {previewDiscountTotal > 0 && <div>تخفیف: {formatToman(previewDiscountTotal)}</div>}
                  </>
                )}
                <div>مالیات ارزش افزوده ({toFaDigits(String(taxRate))}٪ روی کمیسیون): {formatToman(previewTax)}</div>
                <div className="font-bold">جمع دریافتی از مشتری (با مالیات): {formatToman(previewTotal)}</div>
                {previewHasSides && (
                  <>
                    <div>دریافتی از {sideLabels(previewDeal.property.dealType).seller}: {formatToman(previewSellerReceived)}</div>
                    <div>دریافتی از {sideLabels(previewDeal.property.dealType).buyer}: {formatToman(previewBuyerReceived)}</div>
                  </>
                )}
                <div>
                  دریافتی: {formatToman(previewReceived)} {previewDeal.commissionPaid ? "· دریافت شد" : "· پرداخت‌نشده"}
                </div>
                <div className={previewOutstanding > 0 ? "font-bold text-red-600" : ""}>مانده: {formatToman(previewOutstanding)}</div>
              </div>
            )}
            {/* سهم‌بندی — فقط مدیر؛ مثل جدول: دو درصد جدا (کمیسیون و شیرینی) با مبلغ هر بخش */}
            {dealHasIncome(previewDeal) && previewDeal.shares.length > 0 && (
              <div className="mt-3 rounded-[12px] border border-[var(--line)] bg-[var(--paper-2)] p-3 text-[13px] space-y-1">
                <b>سهم‌بندی</b>
                {previewDeal.shares.some((s) => s.virtual) ? (
                  <div className="text-[var(--ink-3)]">تقسیم نشده — {previewDeal.shares[0]?.name} ۱۰۰٪</div>
                ) : (
                  <>
                    {previewDeal.officeAmount != null && previewDeal.officePct != null && (
                      <div>
                        دفتر {toFaDigits(String(previewDeal.officePct))}٪ کمیسیون ·{" "}
                        {toFaDigits(String(previewDeal.officeShiriniPct ?? previewDeal.officePct))}٪ شیرینی · {formatToman(previewDeal.officeAmount)}
                        <span className="block text-[11px] text-[var(--ink-3)]">
                          کمیسیون {formatToman(previewDeal.officeCommissionAmount)} · شیرینی {formatToman(previewDeal.officeShiriniAmount)}
                        </span>
                      </div>
                    )}
                    {previewDeal.shares.map((s) => (
                      <div key={s.id ?? s.name}>
                        {s.isExternal ? `تعاون: ${s.name}` : s.name} {toFaDigits(String(s.pct))}٪ کمیسیون · {toFaDigits(String(s.shiriniPct))}٪ شیرینی ·{" "}
                        {formatToman(s.amount)}
                        {s.settled ? " · تسویه شد" : ""}
                        <span className="block text-[11px] text-[var(--ink-3)]">
                          کمیسیون {formatToman(s.commissionAmount)} · شیرینی {formatToman(s.shiriniAmount)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}
            <div className="flex gap-2 pt-3">
              <Button type="button" variant="ghost" onClick={() => setPreviewDeal(null)}>
                بستن
              </Button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
