import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  getCachedIntegrationSecret,
  setCachedIntegrationSecret,
} from "@/lib/integration-secrets-cache";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
] as const;

function normalizeKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  return key || undefined;
}

export function setServiceRoleKeyCache(key: string) {
  const normalized = normalizeKey(key);
  if (normalized) setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", normalized);
}

/** Sync lookup: in-memory cache then runtime env file / process.env. */
export function getServiceRoleKeySync(): string | undefined {
  const cached = getCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY");
  if (cached) return cached;

  for (const name of ENV_NAMES) {
    const value = normalizeKey(runtimeEnv(name));
    if (value) {
      setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", value);
      return value;
    }
  }
  return undefined;
}

function readFromEnv(): string | undefined {
  for (const name of ENV_NAMES) {
    const value = normalizeKey(runtimeEnv(name));
    if (value) return value;
  }
  return undefined;
}

async function readFromPlatformSecrets(
  supabase: SupabaseClient<Database>,
): Promise<{ key?: string; error?: string }> {
  const { data, error } = await supabase
    .from("platform_secrets")
    .select("supabase_service_role_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) {
    const message = error.message ?? "Unknown database error";
    if (message.includes("supabase_service_role_key")) {
      return {
        error:
          "Database column missing. Run sql/platform-secrets-service-role.sql in Supabase SQL Editor, then save the key under Admin → Settings → Integrations.",
      };
    }
    return { error: `Could not read platform_secrets: ${message}` };
  }

  const key = normalizeKey(data?.supabase_service_role_key);
  return key ? { key } : {};
}

async function readFromPlatformSecretsRpc(
  supabase: SupabaseClient<Database>,
): Promise<string | undefined> {
  const { data, error } = await supabase.rpc("admin_get_service_role_key");
  if (error) return undefined;
  return normalizeKey(typeof data === "string" ? data : undefined);
}

export type ServiceRoleKeyResolution = {
  key?: string;
  hint?: string;
};

/**
 * Resolve service role: memory/runtime env → admin session DB → RPC → env fallback.
 */
export async function resolveServiceRoleKey(
  supabase?: SupabaseClient<Database>,
): Promise<ServiceRoleKeyResolution> {
  const cached = getServiceRoleKeySync();
  if (cached) return { key: cached };

  const client = supabase ?? createClient();

  const fromDb = await readFromPlatformSecrets(client);
  if (fromDb.error) return { hint: fromDb.error };
  if (fromDb.key) {
    setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", fromDb.key);
    return { key: fromDb.key };
  }

  const fromRpc = await readFromPlatformSecretsRpc(client);
  if (fromRpc) {
    setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", fromRpc);
    return { key: fromRpc };
  }

  const fromEnv = readFromEnv();
  if (fromEnv) {
    setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", fromEnv);
    return { key: fromEnv };
  }

  return {
    hint:
      "Supabase service role key is not saved yet. Run sql/platform-secrets-service-role.sql in Supabase, then paste the service_role secret under Admin → Settings → Integrations and click Save. (Coolify env alone is not enough unless Runtime-only + redeploy.)",
  };
}

/** @deprecated Use resolveServiceRoleKey */
export async function bootstrapServiceRoleKey(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  const resolved = await resolveServiceRoleKey(supabase);
  return resolved.key;
}

export async function serviceRoleKeyConfigured(supabase?: SupabaseClient<Database>) {
  return Boolean((await resolveServiceRoleKey(supabase)).key);
}

export function serviceRoleKeyMissingMessage() {
  return (
    "Supabase service role key is not configured. Run sql/platform-secrets-service-role.sql, " +
    "save the key under Admin → Settings → Integrations, or set SUPABASE_SERVICE_ROLE_KEY in Coolify (Runtime only) and redeploy."
  );
}
