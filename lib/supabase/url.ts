/**
 * Server/middleware Supabase API base URL.
 * Prefer SUPABASE_URL (Kong via Docker DNS bridge) so Node server actions
 * never self-fetch through `/api/sb` loopback (that caused "fetch failed" under load).
 * Browser clients must keep using NEXT_PUBLIC_SUPABASE_URL (public HTTPS /api/sb).
 *
 * Intentionally free of `server-only` so middleware can import it.
 */
export function getServerSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const pub = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");

  // Build containers cannot resolve Coolify service hostnames — never use
  // Docker-internal SUPABASE_URL during `next build` static generation.
  const isBuild =
    env.NEXT_PHASE === "phase-production-build" ||
    env.npm_lifecycle_event === "build";

  if (isBuild) return pub || undefined;

  const internal = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (internal) return internal;

  // Fallback only when Kong URL is unset (Edge / emergency).
  const loopback = env.SUPABASE_LOOPBACK_URL?.trim().replace(/\/$/, "");
  if (loopback) return loopback;

  return pub || undefined;
}
