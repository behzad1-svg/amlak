import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
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

  const entries = await prisma.cashboxEntry.findMany({
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  let balance = BigInt(0);
  for (const e of entries) balance += e.type === "IN" ? e.amount : -e.amount;

  return NextResponse.json(serializeBigInt({ entries, balance }));
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
