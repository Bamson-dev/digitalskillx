import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const memory = new Map<string, string>();

export function setCachedIntegrationSecret(envName: string, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return;
  memory.set(envName, trimmed);
  if (!process.env[envName]?.trim()) {
    process.env[envName] = trimmed;
  }
}

export function getCachedIntegrationSecret(envName: string): string | undefined {
  return memory.get(envName) ?? process.env[envName]?.trim() ?? undefined;
}

/** Load integration secrets from platform_secrets using the logged-in admin session. */
export async function warmIntegrationSecretsFromAdminSession(
  supabase: SupabaseClient<Database>,
) {
  const { data, error } = await supabase
    .from("platform_secrets")
    .select(
      "youtube_api_key, deepseek_api_key, paystack_secret_key, supabase_service_role_key, zeptomail_smtp_password",
    )
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) return;

  if (data.youtube_api_key?.trim()) {
    setCachedIntegrationSecret("YOUTUBE_API_KEY", data.youtube_api_key);
  }
  if (data.deepseek_api_key?.trim()) {
    setCachedIntegrationSecret("DEEPSEEK_API_KEY", data.deepseek_api_key);
  }
  if (data.paystack_secret_key?.trim()) {
    setCachedIntegrationSecret("PAYSTACK_SECRET_KEY", data.paystack_secret_key);
  }
  if (data.supabase_service_role_key?.trim()) {
    setCachedIntegrationSecret("SUPABASE_SERVICE_ROLE_KEY", data.supabase_service_role_key);
  }
  if (data.zeptomail_smtp_password?.trim()) {
    setCachedIntegrationSecret("ZEPTOMAIL_SMTP_PASSWORD", data.zeptomail_smtp_password);
  }
}
