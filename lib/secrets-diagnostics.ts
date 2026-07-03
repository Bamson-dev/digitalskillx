import "server-only";
import {
  bootstrapPlatformSecrets,
  fetchPlatformSecretsViaCronAuth,
  readServiceRoleFromEnv,
} from "@/lib/platform-secrets-bootstrap";
import { getCachedIntegrationSecret } from "@/lib/integration-secrets-cache";
import { runtimeEnv } from "@/lib/runtime-env";

const INTEGRATION_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "ZEPTOMAIL_SMTP_PASSWORD",
  "PAYSTACK_SECRET_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;

function deploymentHint() {
  if (process.env.VERCEL === "1") return "vercel";
  if (process.env.COOLIFY_RESOURCE_UUID) return "coolify";
  return "unknown";
}

export async function integrationSecretsDiagnostics() {
  await bootstrapPlatformSecrets();

  const cronSecret = runtimeEnv("CRON_SECRET");
  let cronBootstrap: "ok" | "failed" | "skipped" = "skipped";
  let cronBootstrapDetail = "";

  if (!readServiceRoleFromEnv() && cronSecret) {
    const row = await fetchPlatformSecretsViaCronAuth();
    if (row?.supabase_service_role_key?.trim()) {
      cronBootstrap = "ok";
    } else {
      cronBootstrap = "failed";
      cronBootstrapDetail =
        "CRON_SECRET is set but platform_secrets could not be loaded. Run sql/server-bootstrap-platform-secrets.sql in Supabase and set platform_settings.cron_auth_secret to the same value as CRON_SECRET.";
    }
  }

  const envPresent: Record<string, boolean> = {};
  for (const key of INTEGRATION_ENV_KEYS) {
    envPresent[key] = Boolean(runtimeEnv(key));
  }

  return {
    deployment: deploymentHint(),
    serviceRoleCached: Boolean(getCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY")),
    serviceRoleFromEnv: Boolean(readServiceRoleFromEnv()),
    cronSecretConfigured: Boolean(cronSecret),
    cronBootstrap,
    cronBootstrapDetail,
    envPresent,
    fix:
      deploymentHint() === "vercel"
        ? "Production is on Vercel. Add SUPABASE_SERVICE_ROLE_KEY (and other secrets) in Vercel → Project → Settings → Environment Variables → Production, then redeploy. Coolify/staging env vars do not apply here."
        : "Set SUPABASE_SERVICE_ROLE_KEY (Runtime) or configure CRON bootstrap in platform_settings.",
  };
}
