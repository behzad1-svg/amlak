import { SignJWT, jwtVerify } from "jose";

export const COOKIE_NAME = "saj_token";
export const TOKEN_EXPIRY_SECONDS = 60 * 60 * 24; // 24h

export interface JWTPayload {
  userId: string;
  role: string;
  tokenVersion: number;
}

export function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set — refusing to start with insecure fallback");
  return new TextEncoder().encode(secret);
}

export async function signToken(payload: JWTPayload): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    tokenVersion: payload.tokenVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRY_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = String(payload.userId ?? payload.sub ?? "");
    if (!userId) return null;
    return {
      userId,
      role: String(payload.role ?? ""),
      tokenVersion: Number(payload.tokenVersion ?? 0),
    };
  } catch {
    return null;
  }
}

export function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: TOKEN_EXPIRY_SECONDS,
    path: "/",
  };
}
