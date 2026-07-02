import "server-only";

const PLACEHOLDER = "your-youtube-data-api-key";

export type YoutubeApiKeyStatus = "ok" | "missing" | "placeholder";

/** Whether the running server can call the YouTube Data API. */
export function youtubeApiKeyStatus(): YoutubeApiKeyStatus {
  const raw = process.env.YOUTUBE_API_KEY;
  if (raw == null) return "missing";
  const key = raw.trim();
  if (!key) return "missing";
  if (key === PLACEHOLDER) return "placeholder";
  return "ok";
}

export function youtubeApiKeyConfigured() {
  return youtubeApiKeyStatus() === "ok";
}

export function youtubeApiKeyError(): string {
  switch (youtubeApiKeyStatus()) {
    case "placeholder":
      return "YOUTUBE_API_KEY is still the placeholder value (your-youtube-data-api-key). In Coolify, replace it with your real Google API key, Save, then Redeploy.";
    case "missing":
      return "YOUTUBE_API_KEY is not configured on the server. In Coolify → your app → Environment Variables, add YOUTUBE_API_KEY (exact name, no quotes), Save, then Redeploy.";
    default:
      return "";
  }
}

export function getYoutubeApiKey(): string {
  const err = youtubeApiKeyError();
  if (err) throw new Error(err);
  return process.env.YOUTUBE_API_KEY!.trim();
}
