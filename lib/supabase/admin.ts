import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { runtimeEnv } from "@/lib/runtime-env";
import {
  resolveServiceRoleKey,
  getServiceRoleKeySync,
  serviceRoleKeyMissingMessage,
} from "@/lib/env-service-role";

function buildAdminClient(serviceRoleKey: string) {
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Privileged Supabase client using the service-role key. BYPASSES RLS.
 *
 * SERVER-ONLY. Never import this into a Client Component or expose the key.
 * Prefer createAdminClientAsync when the key may live in platform_secrets.
 */
export function createAdminClient() {
  const serviceRoleKey = getServiceRoleKeySync();
  if (!serviceRoleKey) {
    throw new Error(serviceRoleKeyMissingMessage());
  }
  return buildAdminClient(serviceRoleKey);
}

/** Resolves service role from env or platform_secrets, then returns the admin client. */
export async function createAdminClientAsync(supabase?: SupabaseClient<Database>) {
  const resolved = await resolveServiceRoleKey(supabase);
  if (!resolved.key) {
    throw new Error(resolved.hint ?? serviceRoleKeyMissingMessage());
  }
  return buildAdminClient(resolved.key);
}

export function isServiceRoleConfigured() {
  return Boolean(getServiceRoleKeySync());
}
