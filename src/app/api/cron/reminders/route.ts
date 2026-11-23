import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidCronSecret } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";

/**
 * یادآوری‌های زمان‌بندی‌شدهٔ اعلان‌ها — فقط با رمز کرون سرور فراخوانی می‌شود.
 * GET /api/cron/reminders با هدر x-cron-secret برابر CRON_SECRET
 * - پیگیری‌های سررسیده (گذشته) و امروز مشتریان فعال → FOLLOW_UP_OVERDUE
 * - بازدیدهای ۲ ساعت آینده و بازدیدهای فردا → VIEWING_REMINDER
 * هر مورد در هر روز تقویمی (تهران) فقط یک بار اعلان می‌شود؛ اجرای ساعتی امن است.
 */

// تهران DST ندارد؛ اختلاف ثابت ۳:۳۰+ با UTC
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

function tehranDayStart(d: Date): Date {
  const t = new Date(d.getTime() + TEHRAN_OFFSET_MS);
  t.setUTCHours(0, 0, 0, 0);
  return new Date(t.getTime() - TEHRAN_OFFSET_MS);
}

function faDate(d: Date | string): string {
  return new Date(d).toLocaleDateString("fa-IR", { timeZone: "Asia/Tehran" });
}

function faTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" });
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "یادآوری زمان‌بندی‌شده پیکربندی نشده است" }, { status: 503 });
  if (!isValidCronSecret(req.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = tehranDayStart(now);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000 - 1);
  const soonEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  // اعلان‌های امروز برای جلوگیری از تکرار
  const existing = await prisma.notification.findMany({
    where: {
      type: { in: ["FOLLOW_UP_OVERDUE", "VIEWING_REMINDER"] },
      createdAt: { gte: todayStart },
    },
    select: { userId: true, relatedId: true, type: true, message: true },
  });
  const seen = new Set(
    existing
      .filter((n) => n.message.startsWith("پیگیری مشتری") || n.message.startsWith("بازدید"))
      .map((n) => `${n.userId}:${n.relatedId}:${n.type}`)
  );

  // ۱) پیگیری‌های سررسیده و امروز
  const dueCustomers = await prisma.customer.findMany({
    where: {
      deletedAt: null,
      stage: { in: ["NEW", "INITIAL_CONTACT", "QUALIFIED", "VIEWING", "CONTRACT"] },
      nextFollowUpAt: { lte: todayEnd },
    },
    select: { id: true, name: true, nextFollowUpAt: true, assignedAgentId: true },
  });

  const followUpRows: { userId: string; relatedId: string; priority: string; message: string }[] = [];
  for (const c of dueCustomers) {
    if (!c.assignedAgentId || !c.nextFollowUpAt) continue;
    const key = `${c.assignedAgentId}:${c.id}:FOLLOW_UP_OVERDUE`;
    if (seen.has(key)) continue;
    const overdue = c.nextFollowUpAt < todayStart;
    followUpRows.push({
      userId: c.assignedAgentId,
      relatedId: c.id,
      priority: overdue ? "HIGH" : "NORMAL",
      message: overdue
        ? `پیگیری مشتری «${c.name}» سررسید گذشت (${faDate(c.nextFollowUpAt)}) — تماس بگیرید.`
        : `پیگیری مشتری «${c.name}» امروز سررسید است — تماس بگیرید.`,
    });
  }

  // ۲) بازدیدها: ۲ ساعت آینده و فردا
  const viewings = await prisma.viewing.findMany({
    where: {
      status: "SCHEDULED",
      OR: [
        { startAt: { gt: now, lte: soonEnd } },
        { startAt: { gte: tomorrowStart, lte: tomorrowEnd } },
      ],
    },
    select: {
      id: true,
      agentId: true,
      startAt: true,
      customer: { select: { name: true } },
      property: { select: { title: true } },
    },
  });

  const viewingRows: { userId: string; relatedId: string; priority: string; message: string }[] = [];
  for (const v of viewings) {
    const key = `${v.agentId}:${v.id}:VIEWING_REMINDER`;
    if (seen.has(key)) continue;
    const soon = v.startAt <= soonEnd;
    viewingRows.push({
      userId: v.agentId,
      relatedId: v.id,
      priority: soon ? "HIGH" : "NORMAL",
      message: soon
        ? `بازدید تا ۲ ساعت دیگر (ساعت ${faTime(v.startAt)}): مشتری «${v.customer.name}» — فایل «${v.property.title}».`
        : `بازدید فردا (ساعت ${faTime(v.startAt)}): مشتری «${v.customer.name}» — فایل «${v.property.title}».`,
    });
  }

  const created: { userId: string; type: string; priority: string; relatedType: string; relatedId: string; message: string }[] = [
    ...followUpRows.map((r) => ({ ...r, type: "FOLLOW_UP_OVERDUE" as const, relatedType: "Customer" })),
    ...viewingRows.map((r) => ({ ...r, type: "VIEWING_REMINDER" as const, relatedType: "Viewing" })),
  ];
  if (created.length > 0) {
    await prisma.notification.createMany({
      data: created.map((r) => ({
        userId: r.userId,
        type: r.type as never,
        priority: r.priority as never,
        relatedType: r.relatedType,
        relatedId: r.relatedId,
        message: r.message,
      })),
    });
  }

  const viewingSoon = viewingRows.filter((r) => r.priority === "HIGH").length;
  return NextResponse.json({
    ok: true,
    followUps: followUpRows.length,
    viewingSoon,
    viewingTomorrow: viewingRows.length - viewingSoon,
    skipped: dueCustomers.length + viewings.length - created.length,
  });
}
