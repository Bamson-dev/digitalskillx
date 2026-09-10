/**
 * Server/middleware Supabase API base URL.
 *
 * - Node: prefer SUPABASE_URL (Kong) + fetch-bridge Docker DNS.
 * - Edge middleware: prefer same-origin /api/sb (public or loopback) — Edge cannot
 *   use the Node DNS bridge, and supabase.* has no public DNS.
 * - Browsers: always use NEXT_PUBLIC_SUPABASE_URL.
 *
 * Intentionally free of `server-only` so middleware can import it.
 */
export function getServerSupabaseUrl(): string | undefined {
  const env = process.env as Record<string, string | undefined>;
  const pub = env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");

  const isBuild =
    env.NEXT_PHASE === "phase-production-build" ||
    env.npm_lifecycle_event === "build";
  if (isBuild) return pub || undefined;

  const loopback = env.SUPABASE_LOOPBACK_URL?.trim().replace(/\/$/, "");
  const internal = env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const isEdge = env.NEXT_RUNTIME === "edge";

  if (isEdge) {
    // Avoid NXDOMAIN for supabase.* on Edge — go through the app proxy.
    // Prefer public same-origin URL; loopback may not work in Edge isolates.
    if (pub) return pub;
    if (loopback) return loopback;
    return internal || undefined;
  }

  // Node server actions / route handlers: talk to Kong via DNS bridge.
  if (internal) return internal;
  if (loopback) return loopback;
  return pub || undefined;
}
