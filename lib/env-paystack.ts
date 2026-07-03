import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import {
  getCachedIntegrationSecret,
  setCachedIntegrationSecret,
} from "@/lib/integration-secrets-cache";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const ENV_NAME = "PAYSTACK_SECRET_KEY";

function normalizeKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  return key || undefined;
}

async function readFromAdminSession(
  supabase: SupabaseClient<Database>,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("platform_secrets")
    .select("paystack_secret_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) return undefined;
  return normalizeKey(data?.paystack_secret_key);
}

async function readFromDbViaServiceRole(): Promise<string | undefined> {
  const serviceRole = getServiceRoleKeySync();
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (serviceRole && supabaseUrl) {
    try {
      const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_secrets?id=eq.default&select=paystack_secret_key`;
      const res = await fetch(url, {
        headers: {
          apikey: serviceRole,
          Authorization: `Bearer ${serviceRole}`,
        },
        cache: "no-store",
      });
      if (res.ok) {
        const rows = (await res.json()) as { paystack_secret_key?: string | null }[];
        const key = normalizeKey(rows?.[0]?.paystack_secret_key);
        if (key) {
          setCachedIntegrationSecret(ENV_NAME, key);
          return key;
        }
      }
    } catch {
      // fall through
    }
  }

  try {
    const admin = await createAdminClientAsync();
    const { data, error } = await admin
      .from("platform_secrets")
      .select("paystack_secret_key")
      .eq("id", "default")
      .maybeSingle();
    if (error) return undefined;
    const key = normalizeKey(data?.paystack_secret_key);
    if (key) setCachedIntegrationSecret(ENV_NAME, key);
    return key;
  } catch {
    return undefined;
  }
}

/** Server checkout: memory/runtime env first, then DB via service role. Admin session last. */
async function resolvePaystackSecretKey(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  await bootstrapRuntimeSecrets();

  const cached = normalizeKey(getCachedIntegrationSecret(ENV_NAME));
  if (cached) return cached;

  const fromRuntime = normalizeKey(runtimeEnv(ENV_NAME));
  if (fromRuntime) {
    setCachedIntegrationSecret(ENV_NAME, fromRuntime);
    return fromRuntime;
  }

  const fromDb = await readFromDbViaServiceRole();
  if (fromDb) return fromDb;

  if (supabase) {
    const fromSession = await readFromAdminSession(supabase);
    if (fromSession) {
      setCachedIntegrationSecret(ENV_NAME, fromSession);
      return fromSession;
    }
  }

  return undefined;
}

export async function paystackSecretKeyConfigured(supabase?: SupabaseClient<Database>) {
  return Boolean(await resolvePaystackSecretKey(supabase));
}

export async function getPaystackSecretKey(
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  const key = await resolvePaystackSecretKey(supabase);
  if (key) return key;

  throw new Error(
    "Paystack secret key is not configured. Save it under Admin → Settings → Integrations (recommended), or set PAYSTACK_SECRET_KEY in Coolify (Runtime only) and redeploy.",
  );
}
