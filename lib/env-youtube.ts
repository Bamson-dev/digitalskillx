import "server-only";
import { runtimeEnv, runtimeEnvWithSource } from "@/lib/runtime-env";

const PLACEHOLDER = "your-youtube-data-api-key";
const ENV_NAME = "YOUTUBE_API_KEY";

export type YoutubeApiKeyStatus = "ok" | "missing" | "placeholder";

export type YoutubeApiKeyDiagnostics = {
  status: YoutubeApiKeyStatus;
  source: "file" | "process" | "missing";
};

function readYoutubeKey() {
  return runtimeEnvWithSource(ENV_NAME);
}

/** Whether the running server can call the YouTube Data API. */
export function youtubeApiKeyDiagnostics(): YoutubeApiKeyDiagnostics {
  const { value, source } = readYoutubeKey();
  if (!value) return { status: "missing", source };
  if (value === PLACEHOLDER) return { status: "placeholder", source };
  return { status: "ok", source };
}

export function youtubeApiKeyStatus(): YoutubeApiKeyStatus {
  return youtubeApiKeyDiagnostics().status;
}

export function youtubeApiKeyConfigured() {
  return youtubeApiKeyStatus() === "ok";
}

export function youtubeApiKeyError(): string {
  const { status, source } = youtubeApiKeyDiagnostics();
  switch (status) {
    case "placeholder":
      return "YOUTUBE_API_KEY is still the placeholder value (your-youtube-data-api-key). In Coolify, replace it with your real Google API key, Save, then Redeploy.";
    case "missing":
      return `YOUTUBE_API_KEY is missing inside Next.js (startup wrapper saw it, but route reads ${source}). Redeploy latest staging — the app now loads secrets from .next/runtime-env.json at boot.`;
    default:
      return "";
  }
}

export function getYoutubeApiKey(): string {
  const err = youtubeApiKeyError();
  if (err) throw new Error(err);
  return runtimeEnv(ENV_NAME)!;
}
