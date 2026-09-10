/**
 * Supabase URL helpers.
 *
 * Cookie names from @supabase/ssr are derived from the URL hostname
 * (`sb-<first-label>-auth-token`). Auth/session clients MUST share one
 * hostname with the browser (NEXT_PUBLIC_SUPABASE_URL → /api/sb) or
 * middleware will ignore a successful login and bounce students to /login.
 *
 * Admin/service-role clients may use Kong (SUPABASE_URL) + Docker DNS bridge.
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

/** Browser + cookie/session clients (middleware, RSC, login setSession). */
export function getAuthSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const pub = trimUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  if (isBuildPhase()) return pub;

  // Prefer public same-origin gateway so cookie key matches the browser client.
  if (pub) return pub;

  const loopback = trimUrl(env.SUPABASE_LOOPBACK_URL);
  if (loopback) return loopback;

  return trimUrl(env.SUPABASE_URL);
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
