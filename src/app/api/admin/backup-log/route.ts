// سوابق پشتیبان (BackupLog) — چه کسی، چه وقت، کجا.
// GET: فهرست سوابق برای مدیر (نشست OWNER). اگر جدول هنوز در دیتابیس ساخته
// نشده باشد، به‌جای ۵۰۰ { logs: [], unavailable: true } برمی‌گردد تا صفحهٔ
// مدیر نایستد — همان الگوی /api/admin/error-logs.
// POST: ثبت پشتیبان شبانهٔ خودکار؛ فقط با هدر x-cron-secret برابر CRON_SECRET
// (همان الگوی /api/cron/reminders). بدنه: { fileName, sizeBytes?, destination?, status?, note? }
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { isValidCronSecret } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند سوابق پشتیبان را ببیند" }, { status: 403 });
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50));
  try {
    const logs = await prisma.backupLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
    return NextResponse.json({ logs: serializeBigInt(logs) });
  } catch {
    return NextResponse.json({ logs: [], unavailable: true });
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "پشتیبان شبانه پیکربندی نشده است" }, { status: 503 });
  if (!isValidCronSecret(req.headers.get("x-cron-secret"), secret)) {
    return NextResponse.json({ error: "دسترسی غیرمجاز" }, { status: 401 });
  }
  const body: unknown = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "بدنهٔ درخواست معتبر نیست" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const fileName = typeof b.fileName === "string" && b.fileName.trim() ? b.fileName.trim() : null;
  if (!fileName) {
    return NextResponse.json({ error: "fileName لازم است" }, { status: 400 });
  }
  const sizeNum = b.sizeBytes == null ? null : Number(b.sizeBytes);
  const sizeBytes =
    sizeNum != null && Number.isFinite(sizeNum) && sizeNum >= 0 ? BigInt(Math.floor(sizeNum)) : null;
  const destination =
    typeof b.destination === "string" && b.destination.trim() ? b.destination.trim() : "سرور + Google Drive";
  const status = b.status === "FAILED" ? "FAILED" : "OK";
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  try {
    const log = await prisma.backupLog.create({
      data: {
        userId: null,
        userName: "خودکار",
        kind: "NIGHTLY",
        destination,
        fileName,
        sizeBytes,
        status,
        note,
      },
    });
    return NextResponse.json({ ok: true, id: log.id });
  } catch {
    return NextResponse.json({ logs: [], unavailable: true });
  }
}
