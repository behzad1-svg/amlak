// پشتیبان کامل دیتابیس (pg_dump) برای مدیر — دانلود دستی، علاوه بر بکاپ شبانه خودکار.
// فقط OWNER. خروجی فرمت سفارشی pg_dump است و با pg_restore بازگردانی می‌شود.
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند پشتیبان بگیرد" }, { status: 403 });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: "آدرس دیتابیس تنظیم نشده است" }, { status: 500 });

  const chunks: Buffer[] = [];
  let stderr = "";
  const code: number | null = await new Promise((resolve) => {
    // آدرس دیتابیس (با رمز) از متغیر محیطی خوانده می‌شود تا در فهرست پروسه‌ها دیده نشود
    const child = spawn("pg_dump", ["-Fc"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, DATABASE_URL: dbUrl } });
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", () => resolve(-1));
    child.on("close", (c) => resolve(c));
  });
  const d = new Date().toISOString().slice(0, 10);
  const fileName = `saj-crm-backup-${d}.dump`;
  if (code !== 0) {
    console.error("pg_dump failed:", stderr.slice(0, 500));
    // ثبت تلاش ناموفق هم در سوابق پشتیبان — خرابیِ ثبت، پاسخ را عوض نمی‌کند
    try {
      await prisma.backupLog.create({
        data: {
          userId: session.user.id,
          userName: session.user.name,
          kind: "MANUAL",
          destination: "دانلود در مرورگر",
          fileName,
          status: "FAILED",
          note: stderr.slice(0, 500) || "pg_dump ناموفق بود",
        },
      });
    } catch (e) {
      console.error("backup log failed:", e);
    }
    return NextResponse.json({ error: "پشتیبان‌گیری ناموفق بود" }, { status: 500 });
  }
  const buffer = Buffer.concat(chunks);
  // ثبت پشتیبان دستی در سوابق — خرابیِ ثبت، دانلود را خراب نمی‌کند
  try {
    await prisma.backupLog.create({
      data: {
        userId: session.user.id,
        userName: session.user.name,
        kind: "MANUAL",
        destination: "دانلود در مرورگر",
        fileName,
        sizeBytes: BigInt(buffer.length),
        status: "OK",
      },
    });
  } catch (e) {
    console.error("backup log failed:", e);
  }
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
