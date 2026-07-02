import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runtimeEnvWithSource } from "@/lib/runtime-env";

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

async function readYoutubeKeyFromDatabase(): Promise<string | undefined> {
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

async function resolveYoutubeKey(): Promise<{
  value?: string;
  source: YoutubeApiKeySource;
  loadedFromPath?: string;
}> {
  const fromDb = await readYoutubeKeyFromDatabase();
  if (fromDb) {
    return { value: fromDb, source: "database" };
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
export async function youtubeApiKeyDiagnostics(): Promise<YoutubeApiKeyDiagnostics> {
  const resolved = await resolveYoutubeKey();
  return {
    status: statusFromValue(resolved.value),
    source: resolved.source,
    loadedFromPath: resolved.loadedFromPath,
  };
}

export async function youtubeApiKeyStatus(): Promise<YoutubeApiKeyStatus> {
  return (await youtubeApiKeyDiagnostics()).status;
}

export async function youtubeApiKeyConfigured() {
  return (await youtubeApiKeyStatus()) === "ok";
}

export async function youtubeApiKeyError(): Promise<string> {
  const { status, source } = await youtubeApiKeyDiagnostics();
  switch (status) {
    case "placeholder":
      return "YouTube API key is still the placeholder value. Go to Admin → Settings → Integrations and save your real Google API key.";
    case "missing":
      return "YouTube API key is not configured. Go to Admin → Settings → Integrations, paste your Google API key, and Save. (Coolify env vars are unreliable with Next.js — the key is stored in Supabase instead.)";
    default:
      return "";
  }
}

export async function getYoutubeApiKey(): Promise<string> {
  const err = await youtubeApiKeyError();
  if (err) throw new Error(err);
  const resolved = await resolveYoutubeKey();
  return resolved.value!;
}

/** For admin settings UI — never returns the actual key. */
export async function getYoutubeApiKeyConfiguredFlag(): Promise<boolean> {
  const fromDb = await readYoutubeKeyFromDatabase();
  if (fromDb && fromDb !== PLACEHOLDER) return true;
  const { value } = runtimeEnvWithSource(ENV_NAME);
  return statusFromValue(value) === "ok";
}
