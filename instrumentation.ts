import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    const { bootstrapRuntimeSecrets } = await import("@/lib/bootstrap-runtime-secrets");
    await bootstrapRuntimeSecrets();
    const { youtubeApiKeyStatus } = await import("@/lib/env-youtube");
    console.log(`[digitalskillx] YouTube API key status: ${await youtubeApiKeyStatus()}`);
    const { serviceRoleKeyConfigured } = await import("@/lib/env-service-role");
    console.log(
      `[digitalskillx] Service role key: ${(await serviceRoleKeyConfigured()) ? "configured" : "missing"}`,
    );
    const { paystackSecretKeyConfigured } = await import("@/lib/env-paystack");
    console.log(
      `[digitalskillx] Paystack secret key: ${(await paystackSecretKeyConfigured()) ? "configured" : "missing"}`,
    );
    const { ensureAdminAccount } = await import("@/lib/admin-bootstrap");
    await ensureAdminAccount();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
