/**
 * Supabase URL helpers.
 *
 * Cookie names are pinned via `lib/supabase/auth-cookie.ts` (`sb-www-auth-token`).
 * Do NOT derive session cookie names from these URLs again — that caused the
 * Kong vs /api/sb login bounce.
 *
 * Intentionally free of `server-only` so middleware can import it.
 */

function trimUrl(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/\/$/, "");
  return v || undefined;
}

function isBuildPhase(): boolean {
  const env = process.env as Record<string, string | undefined>;
  return (
    env.NEXT_PHASE === "phase-production-build" ||
    env.npm_lifecycle_event === "build"
  );
}

/**
 * Browser + Edge-safe auth API base (same-origin `/api/sb` gateway).
 * Pair every createBrowserClient / createServerClient with authCookieOptions().
 */
export function getAuthSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const pub = trimUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (isBuildPhase()) return pub;
  if (pub) return pub;

  const loopback = trimUrl(env.SUPABASE_LOOPBACK_URL);
  if (loopback) return loopback;

  return trimUrl(env.SUPABASE_URL);
}

/**
 * Middleware session refresh URL.
 * Prefer container loopback to `/api/sb` so we never hairpin the public IP
 * (cookie name is pinned, so loopback hostname is safe).
 */
export function getMiddlewareSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  if (isBuildPhase()) return getAuthSupabaseUrl();

  const loopback = trimUrl(env.SUPABASE_LOOPBACK_URL);
  if (loopback) return loopback;

  return getAuthSupabaseUrl();
}

/**
 * Privileged server data plane (service role). May use Kong hostname;
 * pair with createServerSupabaseFetch DNS bridge on Contabo.
 */
export function getAdminSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  if (isBuildPhase()) return getAuthSupabaseUrl();

  const internal = trimUrl(env.SUPABASE_URL);
  if (internal) return internal;

  return getAuthSupabaseUrl();
}

/** @deprecated Use getAuthSupabaseUrl for sessions; getAdminSupabaseUrl for service role. */
export function getServerSupabaseUrl(): string | undefined {
  return getAuthSupabaseUrl();
}
