import "server-only";
import { setCachedIntegrationSecret } from "@/lib/integration-secrets-cache";
import { preloadRuntimeEnvIntoProcessEnv } from "@/lib/runtime-env";
import { getPool, isDatabaseConfigured } from "@/lib/db/pool";

export type PlatformSecretsRow = {
  paystack_secret_key?: string | null;
  zeptomail_smtp_password?: string | null;
  youtube_api_key?: string | null;
  deepseek_api_key?: string | null;
};

const COLUMN_TO_ENV: Record<keyof PlatformSecretsRow, string> = {
  paystack_secret_key: "PAYSTACK_SECRET_KEY",
  zeptomail_smtp_password: "ZEPTOMAIL_SMTP_PASSWORD",
  youtube_api_key: "YOUTUBE_API_KEY",
  deepseek_api_key: "DEEPSEEK_API_KEY",
};

/** The database connection string. Present means the app can reach PostgreSQL. */
export function readDatabaseUrlFromEnv(): string | undefined {
  preloadRuntimeEnvIntoProcessEnv();
  return process.env.DATABASE_URL?.trim() || undefined;
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

/** Read the platform_secrets row straight from PostgreSQL. */
export async function fetchPlatformSecretsFromDatabase(): Promise<PlatformSecretsRow | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const cols = Object.keys(COLUMN_TO_ENV)
      .map((c) => `"${c}"`)
      .join(", ");
    const res = await getPool().query(`select ${cols} from public.platform_secrets where id = 'default' limit 1`);
    return (res.rows[0] as PlatformSecretsRow | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Load integration secrets from the runtime env file and the platform_secrets table. */
let bootstrapPromise: Promise<void> | null = null;
let lastBootstrapAt = 0;
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;

async function bootstrapPlatformSecretsInner(): Promise<void> {
  preloadRuntimeEnvIntoProcessEnv();
  if (Date.now() - lastBootstrapAt < BOOTSTRAP_TTL_MS) return;
  const row = await fetchPlatformSecretsFromDatabase();
  if (row) applyPlatformSecretsRow(row);
  lastBootstrapAt = Date.now();
}

export async function bootstrapPlatformSecrets(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapPlatformSecretsInner().catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}
