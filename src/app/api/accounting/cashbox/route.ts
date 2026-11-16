import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { cashboxBalanceFromTotals } from "@/lib/cashbox";
import { cashboxEntrySchema } from "@/lib/validation";
import { serializeBigInt } from "@/lib/utils";
import { createAuditLog } from "@/lib/audit";

/**
 * صندوق دفتر — فقط مدیر.
 * GET /api/accounting/cashbox — فهرست ورودی/خروجی‌ها + موجودی
 * POST /api/accounting/cashbox — ثبت ورودی یا خروجی تازه
 */
export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "صندوق فقط برای مدیر است" }, { status: 403 });
  }

  // موجودی از کل جدول حساب می‌شود، نه فقط ۲۰۰ ردیف آخر فهرست
  const [entries, totals] = await Promise.all([
    prisma.cashboxEntry.findMany({
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
    prisma.cashboxEntry.groupBy({ by: ["type"], _sum: { amount: true } }),
  ]);

  const balance = cashboxBalanceFromTotals(totals);

  // مبدا / مقصد / بابت — ساخت‌یافته، موقع خواندن از dealId/shareId حل می‌شود؛
  // عنوان و یادداشت ذخیره‌شده دست نمی‌خورند.
  // - ورودی خودکار (dealId): معامله = همان معامله؛ شخص = مشاور معامله (کمیسیون او دریافت شد)
  // - خروجی خودکار (shareId): معامله = معاملهٔ آن سهم؛ شخص = صاحب سهم (نام مشاور یا نام تعاون)
  // - دستی (بدون dealId/shareId): هر سه «—» و بابت = همان عنوان نوشته‌شده
  const dealIds = [...new Set(entries.map((e) => e.dealId).filter((x): x is string => Boolean(x)))];
  const shareIds = [...new Set(entries.map((e) => e.shareId).filter((x): x is string => Boolean(x)))];
  const [deals, shares] = await Promise.all([
    dealIds.length > 0
      ? prisma.deal.findMany({
          where: { id: { in: dealIds } },
          select: { id: true, agent: { select: { name: true } }, property: { select: { code: true, title: true } } },
        })
      : [],
    shareIds.length > 0
      ? prisma.dealShare.findMany({
          where: { id: { in: shareIds } },
          select: { id: true, name: true, deal: { select: { property: { select: { code: true, title: true } } } } },
        })
      : [],
  ]);
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const shareById = new Map(shares.map((s) => [s.id, s]));
  const enriched = entries.map((e) => {
    const share = e.shareId ? shareById.get(e.shareId) : undefined;
    const deal = e.dealId ? dealById.get(e.dealId) : undefined;
    const prop = deal?.property ?? share?.deal?.property ?? null;
    return {
      ...e,
      dealCode: prop?.code ?? null,
      dealTitle: prop?.title ?? null,
      personName: share?.name ?? deal?.agent?.name ?? null,
      purpose: share ? "تسویه سهم" : deal ? "دریافت کمیسیون" : e.title,
    };
  });

  return NextResponse.json(serializeBigInt({ entries: enriched, balance }));
}

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "صندوق فقط برای مدیر است" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = cashboxEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;
  const amount = BigInt(d.amount);
  if (amount <= BigInt(0)) {
    return NextResponse.json({ error: "مبلغ باید بیشتر از صفر باشد" }, { status: 400 });
  }
  const occurredAt = d.occurredAt ? new Date(d.occurredAt) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "تاریخ معتبر نیست" }, { status: 400 });
  }

  const entry = await prisma.cashboxEntry.create({
    data: {
      type: d.type,
      amount,
      title: d.title.trim(),
      note: d.note?.trim() || null,
      occurredAt,
      createdById: session.user.id,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  await createAuditLog({
    actorId: session.user.id,
    action: "CASHBOX_ENTRY_CREATED",
    entityType: "CashboxEntry",
    entityId: entry.id,
    newValue: { type: d.type, amount: d.amount, title: d.title } as never,
  });

  return NextResponse.json(serializeBigInt(entry), { status: 201 });
}
