import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

let memoryCache: string | undefined;

function normalizeKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  return key || undefined;
}

/** Sync lookup: in-memory cache (from bootstrap) then runtime env file / process.env. */
export function getServiceRoleKeySync(): string | undefined {
  return memoryCache ?? normalizeKey(runtimeEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

async function readFromPlatformSecrets(
  supabase: SupabaseClient<Database>,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("platform_secrets")
    .select("supabase_service_role_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) return undefined;
  return normalizeKey(data?.supabase_service_role_key);
}

/**
 * Resolve the Supabase service role key when Coolify runtime env is missing.
 * Uses the logged-in admin session to read platform_secrets (RLS: admin only).
 */
export async function bootstrapServiceRoleKey(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  const existing = getServiceRoleKeySync();
  if (existing) {
    memoryCache = existing;
    return existing;
  }

  try {
    const client = supabase ?? createClient();
    const fromDb = await readFromPlatformSecrets(client);
    if (fromDb) {
      memoryCache = fromDb;
      return fromDb;
    }
  } catch {
    // ignore — fall through to missing key handling
  }

  return undefined;
}

export async function serviceRoleKeyConfigured(supabase?: SupabaseClient<Database>) {
  if (getServiceRoleKeySync()) return true;
  return Boolean(await bootstrapServiceRoleKey(supabase));
}

export function serviceRoleKeyMissingMessage() {
  return (
    "Supabase service role key is not configured. Either add SUPABASE_SERVICE_ROLE_KEY in Coolify " +
    "(Runtime only, then redeploy), or save it under Admin → Settings → Integrations, " +
    "or run sql/platform-secrets-service-role.sql in the Supabase SQL Editor."
  );
}
