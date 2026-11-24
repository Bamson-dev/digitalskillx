import "server-only";
import type { DbClient } from "@/lib/db/client";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import {
  getCachedIntegrationSecret,
  setCachedIntegrationSecret,
} from "@/lib/integration-secrets-cache";
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
  supabase: DbClient,
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
  supabase?: DbClient,
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

export async function paystackSecretKeyConfigured(supabase?: DbClient) {
  return Boolean(await resolvePaystackSecretKey(supabase));
}

export async function getPaystackSecretKey(
  supabase?: DbClient,
): Promise<string> {
  const key = await resolvePaystackSecretKey(supabase);
  if (key) return key;

  throw new Error(
    "Paystack secret key is not configured. Save it under Admin → Settings → Integrations (recommended), or set PAYSTACK_SECRET_KEY in Coolify (Runtime only) and redeploy.",
  );
}
