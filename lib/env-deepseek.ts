import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runtimeEnv } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const ENV_NAME = "DEEPSEEK_API_KEY";

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
    .select("deepseek_api_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) return undefined;
  return normalizeKey(data?.deepseek_api_key);
}

async function readFromServiceRole(): Promise<string | undefined> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_secrets")
      .select("deepseek_api_key")
      .eq("id", "default")
      .maybeSingle();

    if (error) return undefined;
    return normalizeKey(data?.deepseek_api_key);
  } catch {
    return undefined;
  }
}

async function resolveDeepseekKey(
  supabase?: SupabaseClient<Database>,
): Promise<string | undefined> {
  if (supabase) {
    const fromSession = await readFromSupabase(supabase);
    if (fromSession) return fromSession;
  } else {
    const fromDb = await readFromServiceRole();
    if (fromDb) return fromDb;
  }

  return normalizeKey(runtimeEnv(ENV_NAME));
}

export async function deepseekApiKeyConfigured(supabase?: SupabaseClient<Database>) {
  return Boolean(await resolveDeepseekKey(supabase));
}

export async function getDeepseekApiKey(
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  const key = await resolveDeepseekKey(supabase);
  if (key) return key;

  throw new Error(
    "DeepSeek API key is not configured. Add DEEPSEEK_API_KEY in Coolify (runtime only), or save it under Admin → Settings → Integrations.",
  );
}

export async function getDeepseekModel(): Promise<string> {
  return runtimeEnv("DEEPSEEK_MODEL") ?? "deepseek-chat";
}
