import { NextResponse } from "next/server";
import { getSessionFromCookies, invalidateUserTokens, COOKIE_NAME_EXPORT } from "@/lib/auth";

export async function POST() {
  const session = await getSessionFromCookies();
  if (session?.user?.id) {
    try {
      await invalidateUserTokens(session.user.id);
    } catch (e) {
      console.error("logout tokenVersion increment failed", e);
    }
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE_NAME_EXPORT);
  return res;
}
