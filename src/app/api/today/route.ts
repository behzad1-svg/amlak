// دادهٔ نمای «امروز» — مشاور فقط موردهای خودش را می‌بیند؛
// مدیر همه را می‌بیند و با agentId می‌تواند یک مشاور را فیلتر کند.
import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { getTodayData } from "@/lib/today";
import { serializeBigInt } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  if (agentId && session.user.role !== "OWNER") {
    return NextResponse.json({ error: "دسترسی ندارید" }, { status: 403 });
  }
  const data = await getTodayData(session.user.id, session.user.role === "OWNER", agentId);
  return NextResponse.json(serializeBigInt(data));
}
