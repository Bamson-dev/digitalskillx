import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { youtubeApiKeyStatus } = await import("@/lib/env-youtube");
    console.log(`[digitalskillx] YOUTUBE_API_KEY status: ${youtubeApiKeyStatus()}`);
    const { ensureAdminAccount } = await import("@/lib/admin-bootstrap");
    await ensureAdminAccount();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
