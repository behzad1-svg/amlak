// ثبت خروج — رکوردِ بازِ امروز را می‌بندد. خروج بعد از پایان شیفت هم
// قبول است (اضافه‌کاری مشکلی ندارد) و شعاع دفتر برای خروج اجباری نیست:
// کسی که خروج را فراموش کرده و از خانه ثبت می‌کند نباید قفل شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import { haversineMeters, tehranDateOnly } from "@/lib/attendance";
import { z } from "zod";

const checkOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = checkOutSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const now = new Date();
  const date = tehranDateOnly(now);
  const open = await prisma.attendance.findFirst({
    where: { userId: session.user.id, date, checkInAt: { not: null }, checkOutAt: null },
    orderBy: { checkInAt: "desc" },
  });
  if (!open) {
    return NextResponse.json({ error: "ورودی ثبت نشده است — اول ورود را ثبت کنید." }, { status: 400 });
  }

  const { lat, lng } = parsed.data;
  let distance: number | undefined;
  if (typeof lat === "number" && typeof lng === "number") {
    const settings = await getAttendanceSettings();
    distance = Math.round(haversineMeters(lat, lng, settings.officeLat, settings.officeLng));
  }
  const record = await prisma.attendance.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: lat ?? null,
      checkOutLng: lng ?? null,
      checkOutDistanceM: distance ?? null,
    },
  });
  return NextResponse.json(record);
}
