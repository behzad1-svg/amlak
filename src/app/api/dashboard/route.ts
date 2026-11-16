// نقد ۲ — روت API داشبورد حالا فقط پوسته‌ای روی getDashboardData است؛
// منطق و موازی‌سازی در src/lib/dashboard.ts است تا صفحهٔ سرور هم از همان استفاده کند.
import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";
import { serializeBigInt } from "@/lib/utils";
import { getDashboardData } from "@/lib/dashboard";

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const data = await getDashboardData(session.user.id, session.user.role === "OWNER");
  return NextResponse.json(serializeBigInt(data));
}
