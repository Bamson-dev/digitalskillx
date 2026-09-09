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
  const internal = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  if (internal) return internal;

  const pub = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  return pub || undefined;
}
