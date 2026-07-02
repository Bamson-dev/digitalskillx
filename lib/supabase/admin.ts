import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runtimeEnv } from "@/lib/runtime-env";

/**
 * Privileged Supabase client using the service-role key. BYPASSES RLS.
 *
 * SERVER-ONLY. Never import this into a Client Component or expose the key.
 * Use only inside Route Handlers / Server Actions for admin operations that
 * legitimately need to act across users (e.g. bulk student creation).
 */
export function createAdminClient() {
  const serviceRoleKey = runtimeEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. In Coolify → Environment Variables, add SUPABASE_SERVICE_ROLE_KEY (from Supabase → Project Settings → API → service_role secret), Runtime only, Save, Redeploy. Or paste your YouTube key via sql/platform-secrets-youtube.sql in Supabase SQL Editor.",
    );
  }
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isServiceRoleConfigured() {
  return Boolean(runtimeEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim());
}
