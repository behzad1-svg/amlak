// نقد ۶ — سلامت + تأخیر دیتابیس (میلی‌ثانیه) برای مشاهده‌پذیری.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", dbMs: Date.now() - start });
  } catch {
    return NextResponse.json({ status: "error", dbMs: Date.now() - start }, { status: 500 });
  }
}
