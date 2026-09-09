/**
 * Server/middleware Supabase API base URL.
 * Prefer SUPABASE_URL (Docker-internal Kong, e.g. http://…:8000) so the app
 * never hairpins through public TLS to reach Contabo Postgres/Auth.
 * Browser clients must keep using NEXT_PUBLIC_SUPABASE_URL (public HTTPS).
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

  const internal = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (internal && !isBuild) return internal;

  return pub || undefined;
}
