import { NextResponse, type NextRequest } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { youtubeApiKeyDiagnostics } from "@/lib/env-youtube";
import { runtimeEnvDiagnostics } from "@/lib/runtime-env";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { integrationSecretsDiagnostics } from "@/lib/secrets-diagnostics";
import { supabaseProjectRef } from "@/lib/supabase-project-ref";
import { configuredAdminEmail } from "@/lib/admin-email";
import { probeDatabaseConnection } from "@/lib/health-database-probe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Coolify/Traefik hit this every few seconds with a short timeout.
 * Public responses must stay instant — never block on Supabase/Paystack/admin auth.
 * Returning slow 200s (or hanging) marks the container unhealthy → "no available server".
 */
export async function GET(request: NextRequest) {
  const wantsDetailed =
    verifyCronSecret(request).ok ||
    Boolean(request.headers.get("authorization")) ||
    Boolean(request.headers.get("cookie"));

  if (!wantsDetailed) {
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  const cron = verifyCronSecret(request);
  let detailed = cron.ok;
  if (!detailed) {
    const adminAuth = await requireAdminApiAuth({ lite: true });
    detailed = !("error" in adminAuth);
  }

  if (!detailed) {
    // Cookie/Authorization present but not an admin/cron caller — still liveness only.
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  await bootstrapRuntimeSecrets();
  const database = await probeDatabaseConnection();

  const youtube = await youtubeApiKeyDiagnostics();
  const paystackReady = await paystackSecretKeyConfigured();
  const secrets = await integrationSecretsDiagnostics();
  const serviceRoleReady = await serviceRoleKeyConfigured();

  const { getContaboIntegrationStatus } = await import("@/lib/storage");
  const contabo = getContaboIntegrationStatus();

  const checks: Record<string, string> = {
    status: database === "connected" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    deployment: secrets.deployment,
    database,
    paystack: paystackReady ? "configured" : "unconfigured",
    contabo: contabo.configured ? "configured" : "unconfigured",
    contaboProvider: contabo.provider,
    youtubeApiKey: youtube.status,
    youtubeApiKeySource: youtube.source,
    supabaseServiceRole: serviceRoleReady ? "configured" : "missing",
    supabaseProjectRef: supabaseProjectRef() ?? "unknown",
    supabaseUrlConfigured: process.env.NEXT_PUBLIC_SUPABASE_URL ? "yes" : "no",
    adminEmail: configuredAdminEmail(),
    cronBootstrap: secrets.cronBootstrap,
  };

  if (paystackReady) {
    try {
      const { getPaystackSecretKey } = await import("@/lib/env-paystack");
      const secret = await getPaystackSecretKey();
      const res = await fetch("https://api.paystack.co/transaction/totals", {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
      });
      checks.paystack = res.ok ? "reachable" : "error";
      if (!res.ok) checks.status = "degraded";
    } catch {
      checks.paystack = "error";
      checks.status = "degraded";
    }
  }

  // Detailed diagnostics may report degraded DB/Paystack, but still 200 so ops
  // tooling can read the payload. Coolify uses the public (non-detailed) path.
  return NextResponse.json(
    {
      ...checks,
      runtimeEnv: runtimeEnvDiagnostics(),
      youtube: await youtubeApiKeyDiagnostics(),
      secrets,
    },
    { status: 200 },
  );
}
