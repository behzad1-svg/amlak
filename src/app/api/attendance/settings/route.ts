// تنظیمات حضور و غیاب — خواندن برای همهٔ کاربران واردشده، تغییر فقط مدیر.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth";
import { getAttendanceSettings } from "@/lib/settings";
import { parseHHMM } from "@/lib/attendance";
import { z } from "zod";

const timeField = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "ساعت باید HH:MM باشد");

const settingsSchema = z
  .object({
    officeLat: z.number().min(-90, "عرض جغرافیایی معتبر نیست").max(90, "عرض جغرافیایی معتبر نیست").optional(),
    officeLng: z.number().min(-180, "طول جغرافیایی معتبر نیست").max(180, "طول جغرافیایی معتبر نیست").optional(),
    radiusM: z.number().int("شعاع باید عدد صحیح باشد").min(10, "شعاع حداقل ۱۰ متر است").max(2000, "شعاع حداکثر ۲۰۰۰ متر است").optional(),
    morningStart: timeField.optional(),
    morningEnd: timeField.optional(),
    eveningStart: timeField.optional(),
    eveningEnd: timeField.optional(),
    fridayOff: z.boolean().optional(),
  })
  .refine(
    (v) => {
      const mStart = v.morningStart ? parseHHMM(v.morningStart) : null;
      const mEnd = v.morningEnd ? parseHHMM(v.morningEnd) : null;
      if (mStart !== null && mEnd !== null && mEnd <= mStart) return false;
      const eStart = v.eveningStart ? parseHHMM(v.eveningStart) : null;
      const eEnd = v.eveningEnd ? parseHHMM(v.eveningEnd) : null;
      if (eStart !== null && eEnd !== null && eEnd <= eStart) return false;
      return true;
    },
    { message: "پایان هر شیفت باید بعد از شروع آن باشد." }
  );

export async function GET() {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  return NextResponse.json(await getAttendanceSettings());
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند تنظیمات حضور و غیاب را تغییر دهد" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const current = await getAttendanceSettings();
  const merged = { ...current, ...parsed.data };
  // اعتبارسنجی ترکیب نهایی (مثلاً شروع صبح جدید با پایان قدیمی)
  if (parseHHMM(merged.morningEnd)! <= parseHHMM(merged.morningStart)!) {
    return NextResponse.json({ error: "پایان شیفت صبح باید بعد از شروع آن باشد." }, { status: 400 });
  }
  if (parseHHMM(merged.eveningEnd)! <= parseHHMM(merged.eveningStart)!) {
    return NextResponse.json({ error: "پایان شیفت عصر باید بعد از شروع آن باشد." }, { status: 400 });
  }
  await prisma.appSetting.upsert({
    where: { key: "attendance" },
    update: { value: JSON.stringify(merged) },
    create: { key: "attendance", value: JSON.stringify(merged) },
  });
  return NextResponse.json(merged);
}
