import "server-only";
import { runtimeEnv, runtimeEnvWithSource } from "@/lib/runtime-env";

const PLACEHOLDER = "your-youtube-data-api-key";
const ENV_NAME = "YOUTUBE_API_KEY";

export type YoutubeApiKeyStatus = "ok" | "missing" | "placeholder";

export type YoutubeApiKeyDiagnostics = {
  status: YoutubeApiKeyStatus;
  source: "file" | "process" | "missing";
  loadedFromPath?: string;
};

/** Whether the running server can call the YouTube Data API. */
export function youtubeApiKeyDiagnostics(): YoutubeApiKeyDiagnostics {
  const { value, source, loadedFromPath } = runtimeEnvWithSource(ENV_NAME);
  if (!value) return { status: "missing", source };
  if (value === PLACEHOLDER) return { status: "placeholder", source, loadedFromPath };
  return { status: "ok", source, loadedFromPath };
}

export function youtubeApiKeyStatus(): YoutubeApiKeyStatus {
  return youtubeApiKeyDiagnostics().status;
}

export function youtubeApiKeyConfigured() {
  return youtubeApiKeyStatus() === "ok";
}

export function youtubeApiKeyError(): string {
  const { status, source, loadedFromPath } = youtubeApiKeyDiagnostics();
  switch (status) {
    case "placeholder":
      return "YOUTUBE_API_KEY is still the placeholder value (your-youtube-data-api-key). In Coolify, replace it with your real Google API key, Save, then Redeploy.";
    case "missing":
      return `YOUTUBE_API_KEY not found (source=${source}). Open /api/health for path diagnostics. Coolify: also add YOUTUBE_API_KEY as a Build variable, Save, Redeploy.`;
    default:
      return "";
  }
}

export function getYoutubeApiKey(): string {
  const err = youtubeApiKeyError();
  if (err) throw new Error(err);
  return runtimeEnv(ENV_NAME)!;
}
