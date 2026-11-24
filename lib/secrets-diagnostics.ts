import "server-only";
import {
  bootstrapPlatformSecrets,
  fetchPlatformSecretsFromDatabase,
  readDatabaseUrlFromEnv,
} from "@/lib/platform-secrets-bootstrap";
import { runtimeEnv } from "@/lib/runtime-env";

const INTEGRATION_ENV_KEYS = [
  "DATABASE_URL",
  "CRON_SECRET",
  "ZEPTOMAIL_SMTP_PASSWORD",
  "RESEND_API_KEY",
  "EMAIL_PROVIDER",
  "PAYSTACK_SECRET_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
] as const;

function deploymentHint() {
  if (process.env.COOLIFY_RESOURCE_UUID) return "coolify";
  return "unknown";
}

export async function integrationSecretsDiagnostics() {
  await bootstrapPlatformSecrets();

  const row = await fetchPlatformSecretsFromDatabase();
  const envPresent: Record<string, boolean> = {};
  for (const key of INTEGRATION_ENV_KEYS) {
    envPresent[key] = Boolean(runtimeEnv(key));
  }

  return {
    deployment: deploymentHint(),
    databaseUrlConfigured: Boolean(readDatabaseUrlFromEnv()),
    platformSecretsRowReadable: Boolean(row),
    cronSecretConfigured: Boolean(runtimeEnv("CRON_SECRET")),
    envPresent,
    fix: "Set DATABASE_URL (Runtime) in the Coolify application environment and redeploy.",
  };
}
