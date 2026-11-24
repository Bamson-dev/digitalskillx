import { SignJWT, jwtVerify } from "jose";

/**
 * Session tokens. Edge-safe (used by middleware) so it must not import node-only modules.
 * The token is an HS256 JWT. Row level security reads its claims through auth.uid().
 */

export const SESSION_COOKIE_NAME = "dsx-session";

export type AccessClaims = {
  sub: string;
  email: string | null;
  role: "authenticated";
  aud: "authenticated";
  session_id: string;
  aal: "aal1" | "aal2";
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  iat: number;
  exp: number;
};

export function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.AUTH_SESSION_MAX_AGE_DAYS ?? 30);
  return Math.max(1, Math.round((Number.isFinite(days) ? days : 30) * 86_400));
}

function signingSecret(): Uint8Array {
  const explicit = process.env.AUTH_JWT_SECRET?.trim();
  if (explicit) return new TextEncoder().encode(explicit);
  // Derived from an existing high-entropy server secret so no new secret is required.
  const cron = process.env.CRON_SECRET?.trim();
  if (cron) return new TextEncoder().encode(`dsx-session-v1|${cron}`);
  throw new Error("Set AUTH_JWT_SECRET (or CRON_SECRET) to sign session tokens");
}

export function isSessionSigningConfigured(): boolean {
  return Boolean(process.env.AUTH_JWT_SECRET?.trim() || process.env.CRON_SECRET?.trim());
}

export async function signAccessToken(
  claims: Omit<AccessClaims, "iat" | "exp" | "role" | "aud">,
  ttlSeconds = sessionMaxAgeSeconds(),
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlSeconds;
  const token = await new SignJWT({ ...claims, role: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(signingSecret());
  return { token, expiresAt: exp };
}

export async function verifyAccessToken(token: string | undefined | null): Promise<AccessClaims | null> {
  if (!token || token.length < 20) return null;
  try {
    const { payload } = await jwtVerify(token, signingSecret(), {
      algorithms: ["HS256"],
      audience: "authenticated",
    });
    if (typeof payload.sub !== "string" || typeof payload.session_id !== "string") return null;
    return payload as unknown as AccessClaims;
  } catch {
    return null;
  }
}

export function cookieOptions(maxAgeSeconds = sessionMaxAgeSeconds()) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: maxAgeSeconds,
  };
}
