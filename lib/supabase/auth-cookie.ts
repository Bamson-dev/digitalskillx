/**
 * Stable auth cookie name for @supabase/ssr.
 *
 * Without an explicit name, @supabase/ssr derives `sb-<first-hostname-label>-auth-token`
 * from the Supabase URL. That caused production outages when login used Kong
 * (`sb-supabase-…`) while the browser/middleware used `/api/sb` on www (`sb-www-…`).
 *
 * Keep this pinned to the live www cookie so existing student sessions survive deploy.
 */
export const AUTH_STORAGE_KEY = "sb-www-auth-token";

/** Old / mismatched keys that must never keep a student "half logged in". */
export const LEGACY_AUTH_STORAGE_KEYS = [
  "sb-supabase-auth-token",
  "sb-127-auth-token",
  "sb-api-auth-token",
] as const;

export function authCookieOptions() {
  return { name: AUTH_STORAGE_KEY } as const;
}

function isChunkOrExact(cookieName: string, storageKey: string) {
  return cookieName === storageKey || cookieName.startsWith(`${storageKey}.`);
}

/** True when the request already carries our canonical session cookie. */
export function hasCanonicalAuthCookie(
  cookies: { name: string; value: string }[],
): boolean {
  return cookies.some(
    (c) => isChunkOrExact(c.name, AUTH_STORAGE_KEY) && c.value.length > 20,
  );
}

/** Expire legacy auth cookies that would confuse middleware / Safari. */
export function expireLegacyAuthCookies(
  setCookie: (name: string, value: string, options: Record<string, unknown>) => void,
  existingNames: string[],
) {
  const expire = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  };

  const toClear = new Set<string>();
  for (const key of LEGACY_AUTH_STORAGE_KEYS) {
    toClear.add(key);
    for (const name of existingNames) {
      if (isChunkOrExact(name, key)) toClear.add(name);
    }
  }

  for (const name of toClear) {
    setCookie(name, "", expire);
  }
}
