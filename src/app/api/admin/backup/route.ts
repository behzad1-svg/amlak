// پشتیبان کامل دیتابیس (pg_dump) برای مدیر — دانلود دستی، علاوه بر بکاپ شبانه خودکار.
// فقط OWNER. خروجی فرمت سفارشی pg_dump است و با pg_restore بازگردانی می‌شود.
// خروجی به‌صورت استریم برمی‌گردد (کل فایل در رم جمع نمی‌شود) و فقط یک بکاپ
// دستی هم‌زمان می‌تواند در جریان باشد.
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { databaseUrlToPgEnv } from "@/lib/backup";

export const dynamic = "force-dynamic";

// قفل درون‌پروسه‌ای: فقط یک بکاپ دستی هم‌زمان — چند کلیک یا تب pg_dump موازی نسازند
let backupInProgress = false;
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

async function logBackup(params: {
  userId: string;
  userName: string;
  fileName: string;
  sizeBytes?: number;
  status: "OK" | "FAILED";
  note?: string;
}): Promise<void> {
  try {
    await prisma.backupLog.create({
      data: {
        userId: params.userId,
        userName: params.userName,
        kind: "MANUAL",
        destination: "دانلود در مرورگر",
        fileName: params.fileName,
        ...(params.sizeBytes !== undefined ? { sizeBytes: BigInt(params.sizeBytes) } : {}),
        status: params.status,
        ...(params.note ? { note: params.note } : {}),
      },
    });
  } catch (e) {
    console.error("backup log failed:", e);
  }
}

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند پشتیبان بگیرد" }, { status: 403 });
  }
  if (backupInProgress) {
    return NextResponse.json({ error: "پشتیبان‌گیری دیگری در حال اجراست؛ چند لحظه دیگر دوباره تلاش کنید" }, { status: 409 });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "آدرس دیتابیس تنظیم نشده است" }, { status: 500 });

  backupInProgress = true;
  const d = new Date().toISOString().slice(0, 10);
  const fileName = `saj-crm-backup-${d}.dump`;
  let stderr = "";
  let bytes = 0;
  let timedOut = false;
  let finished = false;
  const finish = (ok: boolean, note?: string) => {
    if (finished) return;
    finished = true;
    backupInProgress = false;
    void logBackup({
      userId: session.user.id,
      userName: session.user.name,
      fileName,
      sizeBytes: ok ? bytes : undefined,
      status: ok ? "OK" : "FAILED",
      note,
    });
  };

  // آدرس دیتابیس به متغیرهای PG* تبدیل می‌شود: pg_dump متغیر DATABASE_URL را
  // نمی‌خواند (قرارداد Prisma/Node است، نه libpq) و رمز هرگز در آرگومان‌های
  // پروسه قرار نمی‌گیرد تا در فهرست پروسه‌ها دیده نشود
  const child = spawn("pg_dump", ["-Fc"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...databaseUrlToPgEnv(dbUrl) } });
  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, BACKUP_TIMEOUT_MS);

  // صف خروجی: یک هندلر 'data' همهٔ قطعه‌ها را می‌گیرد و استریم وب از صف می‌خواند —
  // به‌این‌ترتیب هیچ قطعه‌ای بین «شروع دانلود» و «اتصال استریم» گم نمی‌شود
  const queue: Buffer[] = [];
  let streamEnded = false;
  let streamError: Error | null = null;
  let ctrl: ReadableStreamDefaultController<Uint8Array> | null = null;
  let gateResolve: ((ok: boolean) => void) | null = null;
  function pump() {
    if (!ctrl) return;
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;
      bytes += chunk.length;
      ctrl.enqueue(chunk);
    }
    if (streamError) ctrl.error(streamError);
    else if (streamEnded) ctrl.close();
  }
  child.stdout.on("data", (chunk: Buffer) => {
    queue.push(chunk);
    if (gateResolve) {
      const resolve = gateResolve;
      gateResolve = null;
      resolve(true);
    }
    pump();
  });
  child.stdout.on("end", () => {
    streamEnded = true;
    pump();
  });
  child.stdout.on("error", (e: Error) => {
    streamError = e;
    pump();
  });

  // صبر تا اولین قطعهٔ خروجی یا خروج پروسه — خطای اتصال سریع معلوم می‌شود و
  // به‌جای دانلود خراب، ۵۰۰ برمی‌گردد؛ بعد از آن خروجی استریم می‌شود
  const started = await new Promise<boolean>((resolve) => {
    gateResolve = resolve;
    child.once("exit", (code) => {
      if (gateResolve) {
        const r = gateResolve;
        gateResolve = null;
        r(code === 0);
      }
    });
    child.once("error", () => {
      if (gateResolve) {
        const r = gateResolve;
        gateResolve = null;
        r(false);
      }
    });
  });
  if (!started) {
    clearTimeout(timeout);
    try {
      child.kill("SIGKILL");
    } catch {
      // پروسه از قبل مرده است
    }
    finish(false, stderr.slice(0, 500) || "pg_dump ناموفق بود");
    return NextResponse.json({ error: "پشتیبان‌گیری ناموفق بود" }, { status: 500 });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
      pump();
    },
    pull() {
      pump();
    },
    cancel() {
      clearTimeout(timeout);
      try {
        child.kill("SIGKILL");
      } catch {
        // پروسه از قبل مرده است
      }
    },
  });

  child.once("close", (code) => {
    clearTimeout(timeout);
    if (code === 0) finish(true);
    else finish(false, timedOut ? "زمان پشتیبان‌گیری تمام شد" : stderr.slice(0, 500) || "pg_dump ناموفق بود");
  });
  child.once("error", () => {
    clearTimeout(timeout);
    finish(false, stderr.slice(0, 500) || "pg_dump ناموفق بود");
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
