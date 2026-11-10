import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import {
  COOKIE_NAME,
  JWTPayload,
  authCookieOptions,
  signToken,
  verifyToken,
} from "./jwt";

export type { JWTPayload };
export { signToken, verifyToken, COOKIE_NAME as COOKIE_NAME_EXPORT };

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function validateSession(token: string | undefined | null) {
  if (!token) return null;
  const payload = await verifyToken(token);
  if (!payload) return null;
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.active) return null;
  if (user.tokenVersion !== payload.tokenVersion) return null;
  return { user, payload };
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  return validateSession(token);
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, authCookieOptions());
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

/** Invalidate all outstanding JWTs for this user (logout, password change, deactivate). */
export async function invalidateUserTokens(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
