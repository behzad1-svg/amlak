// پشتیبان کامل دیتابیس (pg_dump) برای مدیر — دانلود دستی، علاوه بر بکاپ شبانه خودکار.
// فقط OWNER. خروجی فرمت سفارشی pg_dump است و با pg_restore بازگردانی می‌شود.
import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
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
    const child = spawn("pg_dump", ["-Fc", dbUrl], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
    child.on("error", () => resolve(-1));
    child.on("close", (c) => resolve(c));
  });
  if (code !== 0) {
    console.error("pg_dump failed:", stderr.slice(0, 500));
    return NextResponse.json({ error: "پشتیبان‌گیری ناموفق بود" }, { status: 500 });
  }
  const d = new Date().toISOString().slice(0, 10);
  return new NextResponse(Buffer.concat(chunks), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="saj-crm-backup-${d}.dump"`,
    },
  });
}
