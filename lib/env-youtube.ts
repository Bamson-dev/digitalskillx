import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runtimeEnvWithSource } from "@/lib/runtime-env";
import type { Database } from "@/types/database";

const PLACEHOLDER = "your-youtube-data-api-key";
const ENV_NAME = "YOUTUBE_API_KEY";

export type YoutubeApiKeyStatus = "ok" | "missing" | "placeholder";
export type YoutubeApiKeySource = "database" | "file" | "process" | "missing";

export type YoutubeApiKeyDiagnostics = {
  status: YoutubeApiKeyStatus;
  source: YoutubeApiKeySource;
  loadedFromPath?: string;
};

function normalizeKey(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const key = raw.trim();
  return key || undefined;
}

function statusFromValue(value: string | undefined): YoutubeApiKeyStatus {
  if (!value) return "missing";
  if (value === PLACEHOLDER) return "placeholder";
  return "ok";
}

/** Read key using the logged-in admin session (RLS). No service role required. */
async function readYoutubeKeyFromSupabase(
  supabase: SupabaseClient<Database>,
): Promise<string | undefined> {
  const { data, error } = await supabase
    .from("platform_secrets")
    .select("youtube_api_key")
    .eq("id", "default")
    .maybeSingle();

  if (error) return undefined;
  return normalizeKey(data?.youtube_api_key);
}

async function readYoutubeKeyFromServiceRole(): Promise<string | undefined> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_secrets")
      .select("youtube_api_key")
      .eq("id", "default")
      .maybeSingle();

    if (error) return undefined;
    return normalizeKey(data?.youtube_api_key);
  } catch {
    return undefined;
  }
}

async function resolveYoutubeKey(
  supabase?: SupabaseClient<Database>,
): Promise<{
  value?: string;
  source: YoutubeApiKeySource;
  loadedFromPath?: string;
}> {
  if (supabase) {
    const fromSession = await readYoutubeKeyFromSupabase(supabase);
    if (fromSession) return { value: fromSession, source: "database" };
  } else {
    const fromDb = await readYoutubeKeyFromServiceRole();
    if (fromDb) return { value: fromDb, source: "database" };
  }

  const { value, source, loadedFromPath } = runtimeEnvWithSource(ENV_NAME);
  if (value) {
    return {
      value,
      source: source === "missing" ? "missing" : source,
      loadedFromPath,
    };
  }

  return { source: "missing" };
}

/** Whether the running server can call the YouTube Data API. */
export async function youtubeApiKeyDiagnostics(
  supabase?: SupabaseClient<Database>,
): Promise<YoutubeApiKeyDiagnostics> {
  const resolved = await resolveYoutubeKey(supabase);
  return {
    status: statusFromValue(resolved.value),
    source: resolved.source,
    loadedFromPath: resolved.loadedFromPath,
  };
}

export async function youtubeApiKeyStatus(
  supabase?: SupabaseClient<Database>,
): Promise<YoutubeApiKeyStatus> {
  return (await youtubeApiKeyDiagnostics(supabase)).status;
}

export async function youtubeApiKeyConfigured(supabase?: SupabaseClient<Database>) {
  return (await youtubeApiKeyStatus(supabase)) === "ok";
}

export async function youtubeApiKeyError(
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  const { status } = await youtubeApiKeyDiagnostics(supabase);
  switch (status) {
    case "placeholder":
      return "YouTube API key is still the placeholder value. Go to Admin → Settings → Integrations and save your real Google API key.";
    case "missing":
      return "YouTube API key is not configured. Go to Admin → Settings → Integrations, paste your Google API key, and Save.";
    default:
      return "";
  }
}

export async function getYoutubeApiKey(
  supabase?: SupabaseClient<Database>,
): Promise<string> {
  const err = await youtubeApiKeyError(supabase);
  if (err) throw new Error(err);
  const resolved = await resolveYoutubeKey(supabase);
  return resolved.value!;
}

/** For admin settings UI — never returns the actual key. */
export async function getYoutubeApiKeyConfiguredFlag(
  supabase?: SupabaseClient<Database>,
): Promise<boolean> {
  return (await youtubeApiKeyStatus(supabase)) === "ok";
}
