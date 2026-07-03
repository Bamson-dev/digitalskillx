import "server-only";
import { setCachedIntegrationSecret } from "@/lib/integration-secrets-cache";
import { preloadRuntimeEnvIntoProcessEnv, runtimeEnv } from "@/lib/runtime-env";

export type PlatformSecretsRow = {
  supabase_service_role_key?: string | null;
  paystack_secret_key?: string | null;
  zeptomail_smtp_password?: string | null;
  youtube_api_key?: string | null;
  deepseek_api_key?: string | null;
};

const COLUMN_TO_ENV: Record<keyof PlatformSecretsRow, string> = {
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
  paystack_secret_key: "PAYSTACK_SECRET_KEY",
  zeptomail_smtp_password: "ZEPTOMAIL_SMTP_PASSWORD",
  youtube_api_key: "YOUTUBE_API_KEY",
  deepseek_api_key: "DEEPSEEK_API_KEY",
};

const SERVICE_ROLE_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
] as const;

export function readServiceRoleFromEnv(): string | undefined {
  preloadRuntimeEnvIntoProcessEnv();
  for (const name of SERVICE_ROLE_ENV_NAMES) {
    const value = runtimeEnv(name);
    if (value) return value;
  }
  return undefined;
}

export function applyPlatformSecretsRow(row: PlatformSecretsRow) {
  for (const [column, envKey] of Object.entries(COLUMN_TO_ENV) as [
    keyof PlatformSecretsRow,
    string,
  ][]) {
    const value = row[column];
    if (typeof value !== "string" || !value.trim()) continue;
    if (value.includes("PASTE_") && value.includes("_HERE")) continue;
    setCachedIntegrationSecret(envKey, value.trim());
  }
}

export async function fetchPlatformSecretsWithServiceRole(
  serviceRole: string,
): Promise<PlatformSecretsRow | null> {
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  if (!supabaseUrl) return null;

  const select = Object.keys(COLUMN_TO_ENV).join(",");
  const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_secrets?id=eq.default&select=${select}`;

  try {
    const res = await fetch(url, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as PlatformSecretsRow[] | null;
    return rows?.[0] ?? null;
  } catch {
    return null;
  }
}

/** Load platform_secrets using CRON_SECRET + server_bootstrap_platform_secrets RPC. */
export async function fetchPlatformSecretsViaCronAuth(): Promise<PlatformSecretsRow | null> {
  const cronSecret = runtimeEnv("CRON_SECRET");
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!cronSecret || !supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/server_bootstrap_platform_secrets`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_cron_secret: cronSecret }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PlatformSecretsRow | null;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/** Load integration secrets from env file, platform_secrets (service role), or CRON bootstrap. */
export async function bootstrapPlatformSecrets(): Promise<void> {
  preloadRuntimeEnvIntoProcessEnv();

  const existing = readServiceRoleFromEnv();
  if (existing) {
    const row = await fetchPlatformSecretsWithServiceRole(existing);
    if (row) applyPlatformSecretsRow(row);
    return;
  }

  const viaCron = await fetchPlatformSecretsViaCronAuth();
  if (viaCron) {
    applyPlatformSecretsRow(viaCron);
    console.log("[digitalskillx] Loaded platform_secrets via CRON bootstrap");
  }
}
