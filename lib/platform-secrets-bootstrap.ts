import "server-only";
import { setCachedIntegrationSecret, getCachedIntegrationSecret } from "@/lib/integration-secrets-cache";
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

  const cached = getCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY");
  if (cached) return cached;

  for (const name of SERVICE_ROLE_ENV_NAMES) {
    const fromProcess = process.env[name]?.trim();
    if (fromProcess) {
      setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", fromProcess);
      return fromProcess;
    }
    const value = runtimeEnv(name);
    if (value) {
      setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", value);
      return value;
    }
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

/** Probe CRON bootstrap RPC without loading secrets (for health diagnostics). */
export async function probeCronBootstrapRpc(): Promise<{
  httpStatus: number | null;
  reason: string;
}> {
  const cronSecret = runtimeEnv("CRON_SECRET")?.trim();
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!cronSecret) return { httpStatus: null, reason: "CRON_SECRET not set" };
  if (!supabaseUrl || !anonKey) return { httpStatus: null, reason: "Supabase URL/anon key missing" };

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/server_bootstrap_platform_secrets`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ p_cron_secret: cronSecret }),
        cache: "no-store",
      },
    );

    if (res.status === 404) {
      return {
        httpStatus: 404,
        reason: "RPC not found — run sql/server-bootstrap-platform-secrets.sql in THIS Supabase project",
      };
    }
    if (!res.ok) {
      return { httpStatus: res.status, reason: `RPC HTTP ${res.status}` };
    }

    const data = (await res.json()) as { supabase_service_role_key?: string | null } | null;
    if (!data) {
      return {
        httpStatus: res.status,
        reason:
          "RPC returned null — cron_auth_secret in platform_settings does not match Vercel CRON_SECRET, or platform_secrets row is empty",
      };
    }

    const role = data.supabase_service_role_key?.trim() ?? "";
    if (!role || (role.includes("PASTE_") && role.includes("_HERE"))) {
      return {
        httpStatus: res.status,
        reason: "RPC ok but supabase_service_role_key is missing or still a PASTE_…_HERE placeholder in platform_secrets",
      };
    }

    return { httpStatus: res.status, reason: "ok" };
  } catch (err) {
    return {
      httpStatus: null,
      reason: err instanceof Error ? err.message : "RPC request failed",
    };
  }
}

/** Load platform_secrets using CRON_SECRET + server_bootstrap_platform_secrets RPC. */
export async function fetchPlatformSecretsViaCronAuth(): Promise<PlatformSecretsRow | null> {
  const cronSecret = runtimeEnv("CRON_SECRET")?.trim();
  const supabaseUrl = runtimeEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = runtimeEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!cronSecret || !supabaseUrl || !anonKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/server_bootstrap_platform_secrets`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ p_cron_secret: cronSecret }),
        cache: "no-store",
      },
    );

    if (!res.ok) {
      console.warn(
        `[digitalskillx] CRON bootstrap RPC HTTP ${res.status} — run sql/server-bootstrap-platform-secrets.sql in Supabase`,
      );
      return null;
    }

    const data = (await res.json()) as PlatformSecretsRow | null;
    if (!data || typeof data !== "object") {
      console.warn(
        "[digitalskillx] CRON bootstrap returned empty — check platform_settings.cron_auth_secret matches CRON_SECRET",
      );
      return null;
    }

    const role = data.supabase_service_role_key?.trim();
    if (!role || (role.includes("PASTE_") && role.includes("_HERE"))) {
      console.warn("[digitalskillx] CRON bootstrap: service role missing or still a placeholder in platform_secrets");
      return null;
    }

    return data;
  } catch (err) {
    console.warn("[digitalskillx] CRON bootstrap fetch failed:", err);
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
