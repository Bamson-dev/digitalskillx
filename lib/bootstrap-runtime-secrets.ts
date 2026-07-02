import "server-only";
import { preloadRuntimeEnvIntoProcessEnv } from "@/lib/runtime-env";
import { setServiceRoleKeyCache } from "@/lib/env-service-role";

const SECRET_COLUMNS = [
  "youtube_api_key",
  "deepseek_api_key",
  "paystack_secret_key",
  "supabase_service_role_key",
] as const;

const ENV_BY_COLUMN: Record<(typeof SECRET_COLUMNS)[number], string> = {
  youtube_api_key: "YOUTUBE_API_KEY",
  deepseek_api_key: "DEEPSEEK_API_KEY",
  paystack_secret_key: "PAYSTACK_SECRET_KEY",
  supabase_service_role_key: "SUPABASE_SERVICE_ROLE_KEY",
};

/** Load runtime-env.json into process.env and integration secrets from platform_secrets at boot. */
export async function bootstrapRuntimeSecrets() {
  preloadRuntimeEnvIntoProcessEnv();

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRole) setServiceRoleKeyCache(serviceRole);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!supabaseUrl || !serviceRole) return;

  try {
    const select = SECRET_COLUMNS.join(",");
    const url = `${supabaseUrl.replace(/\/$/, "")}/rest/v1/platform_secrets?id=eq.default&select=${select}`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceRole,
        Authorization: `Bearer ${serviceRole}`,
      },
    });

    if (!res.ok) {
      console.warn(`[digitalskillx] platform_secrets bootstrap: HTTP ${res.status}`);
      return;
    }

    const rows = (await res.json()) as Record<string, string | null>[] | null;
    const row = rows?.[0];
    if (!row) return;

    for (const column of SECRET_COLUMNS) {
      const envKey = ENV_BY_COLUMN[column];
      const dbValue = row[column];
      if (!process.env[envKey]?.trim() && typeof dbValue === "string" && dbValue.trim()) {
        process.env[envKey] = dbValue.trim();
        if (envKey === "SUPABASE_SERVICE_ROLE_KEY") {
          setServiceRoleKeyCache(dbValue.trim());
        }
        console.log(`[digitalskillx] Loaded ${envKey} from platform_secrets at boot`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[digitalskillx] platform_secrets bootstrap failed: ${message}`);
  }
}
