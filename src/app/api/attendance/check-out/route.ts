// ثبت خروج — رکوردِ بازِ امروز را می‌بندد. خروج تا یک ساعت پس از پایان
// شیفت ممکن است (صبح تا ۱۴:۰۰، عصر تا ۲۲:۰۰)؛ پس از آن خروج بسته است و
// رکورد با همان ورودِ بدون خروج می‌ماند («مشاور خروج نزده»).
// شعاع دفتر برای خروج اجباری نیست: کسی که خروج را فراموش کرده و از خانه
// ثبت می‌کند نباید قفل شود. اما خروج از بیرونِ محدودهٔ دفتر دلیل می‌خواهد:
// اول بدون دلیل رد می‌شود («شما خارج از محدوده دفتر هستید» + فاصله) و با
// دلیلِ آزاد ثبت می‌شود.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import { CHECKOUT_REASON_MAX, distanceToOffice, isCheckoutOpen, tehranDateOnly } from "@/lib/attendance";
import { z } from "zod";

const checkOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  reason: z.string().trim().max(CHECKOUT_REASON_MAX, "دلیل خروج خیلی طولانی است").optional(),
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

  // مهلت خروج: یک ساعت پس از پایان شیفت؛ پس از آن خروج بسته است.
  const settings = await getAttendanceSettings();
  const checkoutAllowed = isCheckoutOpen(now, open.session, settings);
  if (!checkoutAllowed.ok) {
    return NextResponse.json({ error: checkoutAllowed.message }, { status: 400 });
  }

  const { lat, lng, reason } = parsed.data;
  let distance: number | undefined;
  let outOfRange = false;
  if (typeof lat === "number" && typeof lng === "number") {
    const d = distanceToOffice(lat, lng, settings);
    distance = d.distanceM;
    outOfRange = d.outside;
  }
  if (outOfRange && !reason?.trim()) {
    return NextResponse.json(
      {
        error: "شما خارج از محدوده دفتر هستید",
        outOfRange: true,
        distanceM: distance,
      },
      { status: 400 }
    );
  }
  const record = await prisma.attendance.update({
    where: { id: open.id },
    data: {
      checkOutAt: now,
      checkOutLat: lat ?? null,
      checkOutLng: lng ?? null,
      checkOutDistanceM: distance ?? null,
      checkOutReason: reason?.trim() || null,
    },
  });
  return NextResponse.json(record);
}
