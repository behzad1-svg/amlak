import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { dealUpdateSchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";
import {
  dealSplittable,
  dealTotalCommission,
  dealTotalDiscount,
  dealTotalShirini,
  validateCommissionAmount,
  validateSplitInput,
} from "@/lib/shares";
import { getTaxRatePct } from "@/lib/settings";

// ماشین وضعیت معامله — CANCELED ترمینال است و برنمی‌گردد؛
// COMPLETED فقط از PENDING می‌آید؛ COMPLETED می‌تواند لغو شود.
// (تغییر وضعیت با همان مقدار فعلی، no-op است و مجاز می‌ماند.)
const ALLOWED_DEAL_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["PENDING", "COMPLETED", "CANCELED"],
  COMPLETED: ["COMPLETED", "CANCELED"],
  CANCELED: ["CANCELED"],
};

const DEAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  COMPLETED: "تکمیل‌شده",
  CANCELED: "لغوشده",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      property: { select: { id: true, title: true, dealType: true, region: true } },
      agent: { select: { id: true, name: true } },
    },
  });
  if (!deal) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  if (session.user.role !== "OWNER" && deal.agentId !== session.user.id) {
    // لیست معامله‌ها، معامله را به مشاورِ مشتریِ منتقل‌شده و به سهم‌دار هم
    // نشان می‌دهد (deals/route.ts) — گارد جزئیات باید همان OR را بپذیرد،
    // وگرنه مشاور معامله را در لیست می‌بیند و با کلیک 403 می‌گیرد.
    const [assigned, share] = await Promise.all([
      prisma.customer.findUnique({ where: { id: deal.customerId }, select: { assignedAgentId: true } }),
      prisma.dealShare.findFirst({ where: { dealId: id, userId: session.user.id }, select: { id: true } }),
    ]);
    if (assigned?.assignedAgentId !== session.user.id && !share) {
      return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
    }
  }
  return NextResponse.json(serializeBigInt(deal));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.deal.findUnique({ where: { id }, include: { property: true, customer: true, shares: true } });
  if (!existing) return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  // همان OR لیست معامله‌ها: مشاورِ ثبت‌کننده، مشاورِ مشتریِ منتقل‌شده، یا سهم‌دار
  const canAccessDeal =
    session.user.role === "OWNER" ||
    existing.agentId === session.user.id ||
    existing.customer.assignedAgentId === session.user.id ||
    existing.shares.some((s) => s.userId === session.user.id);
  if (!canAccessDeal) {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = dealUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  // مقدارهای پولی «موثر» بعد از این ویرایش — فیلد نفرستاده یعنی مقدار فعلی.
  // دوطرفه: اگر دست‌کم یک فیلدِ طرفی (فروشنده/خریدار) در همین درخواست آمده باشد،
  // طرف‌ها مرجع‌اند و جمع‌های قدیمی (commissionToman/discountToman) از روی آن‌ها
  // مشتق می‌شوند؛ معامله‌های قدیمی بدون طرف‌بندی همان تک‌کمیسیون قبلی را می‌بینند.
  const hasSideFields =
    d.sellerCommissionToman !== undefined ||
    d.buyerCommissionToman !== undefined ||
    d.sellerCommissionPercent !== undefined ||
    d.buyerCommissionPercent !== undefined ||
    d.sellerReceivedToman !== undefined ||
    d.buyerReceivedToman !== undefined ||
    d.sellerDiscountToman !== undefined ||
    d.buyerDiscountToman !== undefined;
  const bstr = (v: string | null | undefined, prev: bigint | null): bigint | null =>
    v === undefined ? prev : v === null || v === "" ? null : BigInt(v);
  const merged = {
    sellerCommissionToman: bstr(d.sellerCommissionToman, existing.sellerCommissionToman),
    buyerCommissionToman: bstr(d.buyerCommissionToman, existing.buyerCommissionToman),
    sellerCommissionPercent:
      d.sellerCommissionPercent !== undefined ? d.sellerCommissionPercent : existing.sellerCommissionPercent,
    buyerCommissionPercent:
      d.buyerCommissionPercent !== undefined ? d.buyerCommissionPercent : existing.buyerCommissionPercent,
    sellerReceivedToman: bstr(d.sellerReceivedToman, existing.sellerReceivedToman),
    buyerReceivedToman: bstr(d.buyerReceivedToman, existing.buyerReceivedToman),
    sellerDiscountToman: bstr(d.sellerDiscountToman, existing.sellerDiscountToman),
    buyerDiscountToman: bstr(d.buyerDiscountToman, existing.buyerDiscountToman),
    sellerShiriniToman: bstr(d.sellerShiriniToman, existing.sellerShiriniToman),
    buyerShiriniToman: bstr(d.buyerShiriniToman, existing.buyerShiriniToman),
  };
  // شیء سازگار با dealSplittable و دوستان — جمع‌های قدیمی از روی طرف‌ها
  const mergedForSplit = {
    commissionToman:
      merged.sellerCommissionToman != null || merged.buyerCommissionToman != null
        ? (merged.sellerCommissionToman ?? BigInt(0)) + (merged.buyerCommissionToman ?? BigInt(0))
        : bstr(d.commissionToman, existing.commissionToman),
    sellerCommissionToman: merged.sellerCommissionToman,
    buyerCommissionToman: merged.buyerCommissionToman,
    sellerShiriniToman: merged.sellerShiriniToman,
    buyerShiriniToman: merged.buyerShiriniToman,
    discountToman:
      merged.sellerDiscountToman != null || merged.buyerDiscountToman != null
        ? (merged.sellerDiscountToman ?? BigInt(0)) + (merged.buyerDiscountToman ?? BigInt(0))
        : bstr(d.discountToman, existing.discountToman),
    sellerDiscountToman: merged.sellerDiscountToman,
    buyerDiscountToman: merged.buyerDiscountToman,
  };

  // کمیسیون و شیرینی را فقط مدیر تعیین می‌کند
  const wantsCommission =
    Boolean(d.commissionToman) ||
    Boolean(d.sellerShiriniToman) ||
    Boolean(d.buyerShiriniToman) ||
    Boolean(d.discountToman) ||
    (d.commissionPercent !== undefined && d.commissionPercent !== null) ||
    Boolean(d.sellerCommissionToman) ||
    Boolean(d.buyerCommissionToman) ||
    Boolean(d.sellerReceivedToman) ||
    Boolean(d.buyerReceivedToman) ||
    Boolean(d.sellerDiscountToman) ||
    Boolean(d.buyerDiscountToman) ||
    (d.sellerCommissionPercent !== undefined && d.sellerCommissionPercent !== null) ||
    (d.buyerCommissionPercent !== undefined && d.buyerCommissionPercent !== null);
  if (session.user.role !== "OWNER" && wantsCommission) {
    return NextResponse.json({ error: "کمیسیون را فقط مدیر تعیین می‌کند" }, { status: 403 });
  }

  // سهم‌بندی را فقط مدیر تعیین می‌کند؛ officePct و shares همیشه با هم می‌آیند
  const wantsShares = d.officePct !== undefined || d.officeShiriniPct !== undefined || d.shares !== undefined;
  if (wantsShares && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "سهم‌بندی را فقط مدیر تعیین می‌کند" }, { status: 403 });
  }

  // سهم‌بندی فقط وقتی معنا دارد که درآمد قابل‌تقسیم معامله (کمیسیون + شیرینی‌ها) بیشتر از صفر باشد
  let shareRows: { userId: string | null; name: string; pct: number; shiriniPct: number | null }[] | null = null;
  if (wantsShares) {
    if (d.officePct === undefined || d.shares === undefined) {
      return NextResponse.json({ error: "سهم دفتر و سهم‌ها را با هم بفرستید" }, { status: 400 });
    }
    // درآمد قابل‌تقسیم (خالص) بعد از این ویرایش — کمیسیون کل دو طرف + شیرینی‌ها منهای تخفیف کل
    const effectiveIncome = dealSplittable(mergedForSplit);
    // خالی کردن درآمد یعنی پاک شدن سهم‌بندی (سهم دفتر ۱۰۰٪ و بدون سهم)؛
    // در این حالت چک «درآمد تعیین شده» اعمال نمی‌شود
    if (effectiveIncome <= BigInt(0)) {
      if (d.shares.length > 0 || d.officePct !== 100) {
        return NextResponse.json(
          { error: "با خالی کردن کمیسیون و شیرینی، سهم‌بندی هم باید پاک شود (سهم دفتر ۱۰۰٪ و بدون سهم)" },
          { status: 400 }
        );
      }
    }
    // قفل سهم‌بندی: اگر هر سهمی تسویه شده باشد، کل تقسیم قفل است
    if (existing.shares.some((s) => s.settled)) {
      return NextResponse.json(
        { error: "سهمی تسویه شده است؛ برای تغییر اول تسویه را برگردانید" },
        { status: 400 }
      );
    }
    const officeShiriniPct = d.officeShiriniPct ?? d.officePct;
    const splitError = validateSplitInput(
      d.officePct,
      officeShiriniPct,
      d.shares.map((s) => ({ userId: s.userId ?? null, name: s.name ?? null, pct: s.pct, shiriniPct: s.shiriniPct ?? null }))
    );
    if (splitError) return NextResponse.json({ error: splitError }, { status: 400 });
    // مشاور داخلی باید کاربر فعال موجود باشد؛ نامش از روی کاربر برداشته می‌شود
    const internalIds = [...new Set(d.shares.filter((s) => s.userId).map((s) => s.userId as string))];
    const users =
      internalIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: internalIds }, active: true },
            select: { id: true, name: true },
          })
        : [];
    if (users.length !== internalIds.length) {
      return NextResponse.json({ error: "مشاور انتخاب‌شده معتبر نیست یا غیرفعال است" }, { status: 400 });
    }
    const userById = new Map(users.map((u) => [u.id, u.name]));
    shareRows = d.shares.map((s) =>
      s.userId
        ? { userId: s.userId, name: userById.get(s.userId) ?? "", pct: s.pct, shiriniPct: s.shiriniPct ?? null }
        : { userId: null, name: (s.name ?? "").trim(), pct: s.pct, shiriniPct: s.shiriniPct ?? null }
    );
  }

  // خالی کردن درآمد (کمیسیون + شیرینی‌ها) وقتی سهمی تسویه شده، قفل سهم‌بندی را نامرئی می‌کند — ممنوع
  const incomeTouched =
    d.commissionToman !== undefined || d.sellerShiriniToman !== undefined || d.buyerShiriniToman !== undefined || d.discountToman !== undefined ||
    hasSideFields;
  const incomeAfter = dealSplittable(mergedForSplit);
  // تخفیف نمی‌تواند بیشتر از جمع ناخالص (کمیسیون + شیرینی‌ها) باشد — خالص منفی نشود
  const grossAfter = dealTotalCommission(mergedForSplit) + dealTotalShirini(mergedForSplit);
  const discountAfter = dealTotalDiscount(mergedForSplit);
  if (discountAfter > grossAfter) {
    return NextResponse.json(
      { error: "تخفیف نمی‌تواند بیشتر از جمع کمیسیون و شیرینی باشد" },
      { status: 400 }
    );
  }
  // تخفیف هر طرف نمی‌تواند بیشتر از کمیسیون همان طرف باشد — مالیات همیشه
  // روی کمیسیون کامل حساب می‌شود، تخفیف فقط از کمیسیون کم می‌کند
  const sideCommissionForCap = (side: bigint | null): bigint => {
    if (side != null) return side;
    // معامله قدیمی بدون طرف‌بندی: کمیسیون تک‌فیلدی همان طرف فروشنده است
    return merged.sellerCommissionToman == null && merged.buyerCommissionToman == null
      ? (mergedForSplit.commissionToman ?? BigInt(0))
      : BigInt(0);
  };
  if ((merged.sellerDiscountToman ?? BigInt(0)) > sideCommissionForCap(merged.sellerCommissionToman)) {
    return NextResponse.json(
      { error: "تخفیف فروشنده نمی‌تواند بیشتر از کمیسیون فروشنده باشد" },
      { status: 400 }
    );
  }
  if ((merged.buyerDiscountToman ?? BigInt(0)) > (merged.buyerCommissionToman ?? BigInt(0))) {
    return NextResponse.json(
      { error: "تخفیف خریدار نمی‌تواند بیشتر از کمیسیون خریدار باشد" },
      { status: 400 }
    );
  }
  // مبلغ کمیسیون باید با درصد × قیمت معامله بخواند (فقط فروش؛ اجاره دستی است).
  // فقط وقتی یکی از سه ورودی سه‌تایی (قیمت/درصد/مبلغ) در همین درخواست آمده باشد
  // چک می‌شود تا ویرایش غیرپولی معامله‌های قدیمیِ ناسازگار (مثل F-0022) مسدود نشود.
  const touchesCommissionTriple =
    d.dealSalePriceToman !== undefined || d.commissionToman !== undefined || d.commissionPercent !== undefined || hasSideFields;
  if (touchesCommissionTriple && existing.property.dealType === "SALE") {
    const effectivePrice =
      d.dealSalePriceToman !== undefined
        ? d.dealSalePriceToman
          ? BigInt(d.dealSalePriceToman)
          : null
        : existing.dealSalePriceToman;
    if (hasSideFields || merged.sellerCommissionToman != null || merged.buyerCommissionToman != null) {
      // دوطرفه: هر طرف جدا با درصد همان طرف چک می‌شود
      const sellerError = validateCommissionAmount(effectivePrice, merged.sellerCommissionPercent, merged.sellerCommissionToman);
      if (sellerError) return NextResponse.json({ error: `فروشنده: ${sellerError}` }, { status: 400 });
      const buyerError = validateCommissionAmount(effectivePrice, merged.buyerCommissionPercent, merged.buyerCommissionToman);
      if (buyerError) return NextResponse.json({ error: `خریدار: ${buyerError}` }, { status: 400 });
    } else {
      const effectivePercent = d.commissionPercent !== undefined ? d.commissionPercent : existing.commissionPercent;
      const effectiveAmount =
        d.commissionToman !== undefined
          ? d.commissionToman
            ? BigInt(d.commissionToman)
            : null
          : existing.commissionToman;
      const commissionError = validateCommissionAmount(effectivePrice, effectivePercent, effectiveAmount);
      if (commissionError) return NextResponse.json({ error: commissionError }, { status: 400 });
    }
  }

  const clearingIncome = incomeTouched && incomeAfter <= BigInt(0);
  if (clearingIncome && existing.shares.some((s) => s.settled)) {
    return NextResponse.json(
      { error: "سهمی تسویه شده است؛ برای تغییر اول تسویه را برگردانید" },
      { status: 400 }
    );
  }

  // پس از تسویه، قیمت/کمیسیون قفل است — اول باید تسویه برگردد؛ لغو هم با بلوک جداگانه‌اش
  // وقتی پول دریافت یا سهمی تسویه شده باشد مسدود است
  const wantsMoneyChange =
    d.dealSalePriceToman !== undefined ||
    d.dealDepositToman !== undefined ||
    d.dealMonthlyRentToman !== undefined ||
    d.commissionToman !== undefined ||
    d.commissionPercent !== undefined ||
    d.sellerShiriniToman !== undefined ||
    d.buyerShiriniToman !== undefined ||
    d.discountToman !== undefined ||
    hasSideFields ||
    d.officePct !== undefined ||
    d.shares !== undefined;
  // سوراخ قفل تسویه: تسویه یک سهم به‌تنهایی commissionPaid را true نمی‌کند، پس قفل
  // تسویه کلی جلوی تغییر نرخ/مبلغ را نمی‌گیرد — در حالی که مبلغ سهم تسویه‌شده از روی
  // کمیسیون تازه دوباره محاسبه می‌شود. اگر هر سهمی تسویه شده باشد، هر تغییر پولی ممنوع است.
  if (existing.shares.some((s) => s.settled) && wantsMoneyChange) {
    return NextResponse.json(
      { error: "سهمی تسویه شده است؛ برای تغییر اول تسویه را برگردانید" },
      { status: 400 }
    );
  }
  if (existing.commissionPaid && wantsMoneyChange) {
    return NextResponse.json(
      { error: "این معامله تسویه شده است؛ برای تغییر قیمت یا کمیسیون اول تسویه را برگردانید" },
      { status: 400 }
    );
  }

  // معامله تکمیل‌شده برای مشاور قفل است — فقط لغو مجاز است، نه تغییر مبلغ/کمیسیون/تاریخ
  if (existing.status === "COMPLETED" && session.user.role !== "OWNER") {
    const onlyCancel =
      d.status === "CANCELED" &&
      d.contractAt === undefined &&
      d.notes === undefined &&
      d.dealSalePriceToman === undefined &&
      d.dealDepositToman === undefined &&
      d.dealMonthlyRentToman === undefined &&
      d.sellerShiriniToman === undefined &&
      d.buyerShiriniToman === undefined &&
      d.discountToman === undefined &&
      !hasSideFields;
    if (!onlyCancel) {
      return NextResponse.json(
        { error: "معامله تکمیل‌شده فقط توسط مدیر قابل ویرایش است؛ مشاور فقط می‌تواند آن را لغو کند" },
        { status: 403 }
      );
    }
  }

  const nextStatus = d.status ?? existing.status;

  // گارد ماشین وضعیت: انتقال غیرمجاز رد می‌شود (۴۰۹)
  if (d.status && d.status !== existing.status) {
    const allowed = ALLOWED_DEAL_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(d.status)) {
      return NextResponse.json(
        {
          error: `تغییر وضعیت معامله از «${DEAL_STATUS_LABELS[existing.status] ?? existing.status}» به «${DEAL_STATUS_LABELS[d.status] ?? d.status}» مجاز نیست`,
        },
        { status: 409 },
      );
    }
  }

  // لغو معامله‌ای که پولش دریافت یا سهمی از آن تسویه شده ممکن نیست — ورودی
  // صندوق و خروجی‌های تسویه در لغو دست نمی‌خورند و معامله از جمع‌ها حذف می‌شود،
  // پس اول باید تسویه سهم‌ها و بعد دریافت برگردانده شود (همان ترتیبی که قفل
  // برگرداندن دریافت می‌خواهد).
  if (
    d.status === "CANCELED" &&
    d.status !== existing.status &&
    (existing.commissionPaid || existing.shares.some((s) => s.settled))
  ) {
    return NextResponse.json(
      { error: "این معامله دریافت یا تسویه شده است؛ برای لغو اول تسویه سهم‌ها و بعد دریافت را برگردانید" },
      { status: 400 }
    );
  }

  // قبل از تکمیل، دوباره چک کن معامله باز دیگری روی همین فایل نباشد
  if (nextStatus === "COMPLETED" && existing.status !== "COMPLETED") {
    const otherOpen = await prisma.deal.findFirst({
      where: {
        propertyId: existing.propertyId,
        id: { not: id },
        status: { in: ["PENDING", "COMPLETED"] },
      },
    });
    if (otherOpen) {
      return NextResponse.json({ error: "معامله باز دیگری روی این فایل وجود دارد" }, { status: 409 });
    }
  }

  const data: Record<string, unknown> = {};
  if (d.contractAt !== undefined) data.contractAt = d.contractAt ? new Date(d.contractAt) : null;
  if (d.notes !== undefined) data.notes = d.notes;
  if (session.user.role === "OWNER") {
    if (hasSideFields) {
      // دوطرفه: طرف‌ها مرجع‌اند؛ جمع‌های قدیمی از روی طرف‌های موثر مشتق می‌شوند
      if (d.sellerCommissionToman !== undefined)
        data.sellerCommissionToman = d.sellerCommissionToman ? BigInt(d.sellerCommissionToman) : null;
      if (d.buyerCommissionToman !== undefined)
        data.buyerCommissionToman = d.buyerCommissionToman ? BigInt(d.buyerCommissionToman) : null;
      if (d.sellerCommissionPercent !== undefined) data.sellerCommissionPercent = d.sellerCommissionPercent;
      if (d.buyerCommissionPercent !== undefined) data.buyerCommissionPercent = d.buyerCommissionPercent;
      if (d.sellerReceivedToman !== undefined)
        data.sellerReceivedToman = d.sellerReceivedToman ? BigInt(d.sellerReceivedToman) : null;
      if (d.buyerReceivedToman !== undefined)
        data.buyerReceivedToman = d.buyerReceivedToman ? BigInt(d.buyerReceivedToman) : null;
      if (d.sellerDiscountToman !== undefined)
        data.sellerDiscountToman = d.sellerDiscountToman ? BigInt(d.sellerDiscountToman) : null;
      if (d.buyerDiscountToman !== undefined)
        data.buyerDiscountToman = d.buyerDiscountToman ? BigInt(d.buyerDiscountToman) : null;
      const hasAnyCommission = merged.sellerCommissionToman != null || merged.buyerCommissionToman != null;
      data.commissionToman = hasAnyCommission ? dealTotalCommission(mergedForSplit) : null;
      const hasAnyDiscount = merged.sellerDiscountToman != null || merged.buyerDiscountToman != null;
      data.discountToman = hasAnyDiscount ? dealTotalDiscount(mergedForSplit) : null;
      // درصد قدیمی: اگر هر دو طرف یک درصد دارند همان، وگرنه درصد تنها طرفِ تعیین‌شده
      data.commissionPercent =
        merged.sellerCommissionPercent != null && merged.sellerCommissionPercent === merged.buyerCommissionPercent
          ? merged.sellerCommissionPercent
          : (merged.sellerCommissionPercent ?? merged.buyerCommissionPercent ?? null);
      // مهر نرخ مالیات فقط در نخستین ثبت کمیسیون؛ خالی کردن هر دو طرف یعنی حذف مهر نرخ
      data.taxRatePct = hasAnyCommission ? (existing.taxRatePct ?? (await getTaxRatePct())) : null;
    } else {
      // مسیر قدیمی — معامله بدون طرف‌بندی
      if (d.commissionToman !== undefined) {
        data.commissionToman = d.commissionToman ? BigInt(d.commissionToman) : null;
        // مهر نرخ مالیات فقط در نخستین ثبت کمیسیون؛ ویرایش بعدی مبلغ روی نرخ مهرشده اثر ندارد
        // خالی کردن کمیسیون یعنی حذف مهر نرخ
        data.taxRatePct = d.commissionToman ? (existing.taxRatePct ?? (await getTaxRatePct())) : null;
      }
      if (d.commissionPercent !== undefined) data.commissionPercent = d.commissionPercent;
      if (d.discountToman !== undefined)
        data.discountToman = d.discountToman ? BigInt(d.discountToman) : null;
    }
    if (d.sellerShiriniToman !== undefined)
      data.sellerShiriniToman = d.sellerShiriniToman ? BigInt(d.sellerShiriniToman) : null;
    if (d.buyerShiriniToman !== undefined)
      data.buyerShiriniToman = d.buyerShiriniToman ? BigInt(d.buyerShiriniToman) : null;
    if (d.officePct !== undefined) data.officePct = d.officePct;
    if (d.officeShiriniPct !== undefined) data.officeShiriniPct = d.officeShiriniPct;
  }
  if (d.dealSalePriceToman !== undefined)
    data.dealSalePriceToman = d.dealSalePriceToman ? BigInt(d.dealSalePriceToman) : null;
  if (d.dealDepositToman !== undefined)
    data.dealDepositToman = d.dealDepositToman ? BigInt(d.dealDepositToman) : null;
  if (d.dealMonthlyRentToman !== undefined)
    data.dealMonthlyRentToman = d.dealMonthlyRentToman ? BigInt(d.dealMonthlyRentToman) : null;

  if (d.status) {
    data.status = d.status;
    if (d.status === "CANCELED") data.canceledAt = new Date();
    if (d.status !== "CANCELED") data.canceledAt = null;
  }

  // تکمیل معامله یعنی تاریخ قرارداد — اگر خالی است، همین لحظه مهر می‌خورد
  // (گزارش عملکرد معامله‌های تکمیل‌شده را با contractAt می‌سنجد، نه createdAt)
  if (nextStatus === "COMPLETED" && existing.status !== "COMPLETED" && d.contractAt === undefined && !existing.contractAt) {
    data.contractAt = new Date();
  }

  // مهر نرخ برای معامله قدیمی دارای کمیسیون هنگام تکمیل
  if (
    nextStatus === "COMPLETED" &&
    existing.status !== "COMPLETED" &&
    data.taxRatePct === undefined &&
    existing.commissionToman != null &&
    existing.taxRatePct == null
  ) {
    data.taxRatePct = await getTaxRatePct();
  }

  const deal = await prisma.$transaction(async (tx) => {
    const updated = await tx.deal.update({ where: { id }, data });

    // سهم‌بندی تازه جایگزین سهم‌های قبلی می‌شود (سهم تسویه‌شده‌ای نیست — بالاتر قفل شده)
    if (shareRows) {
      await tx.dealShare.deleteMany({ where: { dealId: id } });
      if (shareRows.length > 0) {
        await tx.dealShare.createMany({
          data: shareRows.map((r) => ({
            dealId: id,
            userId: r.userId,
            name: r.name,
            pct: r.pct,
            shiriniPct: r.shiriniPct,
            settled: false,
            settledAt: null,
          })),
        });
      }
    }

    const prop = existing.property;
    const cust = existing.customer;

    if (nextStatus === "COMPLETED" && existing.status !== "COMPLETED") {
      const newStatus = prop.dealType === "SALE" ? "SOLD" : "RENTED";
      await tx.property.update({ where: { id: prop.id }, data: { status: newStatus as never } });
      // تکمیل معامله یعنی مشتری «موفق» شد — فقط مسیر معامله مرحله را WON می‌کند
      if (cust.stage !== "WON" && cust.stage !== "LOST") {
        await tx.customer.update({
          where: { id: cust.id },
          data: { stage: "WON" as never, nextFollowUpAt: null },
        });
      }
    }

    if (nextStatus === "CANCELED" && (existing.status === "COMPLETED" || existing.status === "PENDING")) {
      // Free the property only if no other open/completed deal holds it
      const otherOpen = await tx.deal.findFirst({
        where: {
          propertyId: prop.id,
          id: { not: id },
          status: { in: ["PENDING", "COMPLETED"] },
        },
      });
      if (!otherOpen && (prop.status === "SOLD" || prop.status === "RENTED" || prop.status === "RESERVED")) {
        await tx.property.update({ where: { id: prop.id }, data: { status: "ACTIVE" as never } });
      }
    }

    return updated;
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "DEAL_UPDATED",
    entityType: "Deal",
    entityId: id,
    oldValue: { status: existing.status } as never,
    newValue: { status: nextStatus } as never,
  });

  return NextResponse.json(serializeBigInt(deal));
}
