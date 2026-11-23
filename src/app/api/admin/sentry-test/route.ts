import { NextResponse } from "next/server";
import { getSessionFromCookies } from "@/lib/auth";

// OWNER-only test endpoint: throws a test error so Sentry capture can be verified
// live (call GET /api/admin/sentry-test as admin, then check the Sentry project).
// It throws only after the auth check, so it cannot be triggered anonymously.
export async function GET() {
  // فقط غیرپروداکشن — در پروداکشن این مسیر وجود ندارد (404) تا خطای
  // آزمایشی تصادفی وارد Sentry نشود؛ تست Sentry در dev انجام می‌شود.
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "یافت نشد" }, { status: 404 });
  }
  const session = await getSessionFromCookies();
  if (!session) return NextResponse.json({ error: "وارد نشده‌اید" }, { status: 401 });
  if (session.user.role !== "OWNER") {
    return NextResponse.json({ error: "فقط مدیر می‌تواند خطای آزمایشی بفرستد" }, { status: 403 });
  }
  throw new Error("Sentry test error (admin-triggered)");
}
