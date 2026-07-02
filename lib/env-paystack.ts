import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { bootstrapServiceRoleKey } from "@/lib/env-service-role";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const ENV_NAME = "PAYSTACK_SECRET_KEY";

function normalizeKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  return key || undefined;
}

async function readFromSupabase(
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

async function readFromPlatformSecretsDb(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  await bootstrapServiceRoleKey(supabase);
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_secrets")
      .select("paystack_secret_key")
      .eq("id", "default")
      .maybeSingle();

    if (error) return undefined;
    return normalizeKey(data?.paystack_secret_key);
  } catch {
    return undefined;
  }
}

/** Server checkout + webhooks: runtime env → platform_secrets (via service role). */
async function resolvePaystackSecretKey(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  const fromRuntime = normalizeKey(runtimeEnv(ENV_NAME));
  if (fromRuntime) return fromRuntime;

  if (supabase) {
    const fromSession = await readFromSupabase(supabase);
    if (fromSession) return fromSession;
  }

  return readFromPlatformSecretsDb(supabase);
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
    "Paystack secret key is not configured. Save it under Admin → Settings → Integrations, or set PAYSTACK_SECRET_KEY in Coolify (runtime only) and redeploy.",
  );
}
