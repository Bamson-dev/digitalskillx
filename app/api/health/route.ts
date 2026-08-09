import { NextResponse, type NextRequest } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { youtubeApiKeyDiagnostics } from "@/lib/env-youtube";
import { runtimeEnvDiagnostics } from "@/lib/runtime-env";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { integrationSecretsDiagnostics } from "@/lib/secrets-diagnostics";
import { supabaseProjectRef } from "@/lib/supabase-project-ref";
import { configuredAdminEmail } from "@/lib/admin-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public: minimal liveness only. Full diagnostics require admin session or CRON_SECRET. */
export async function GET(request: NextRequest) {
  await bootstrapRuntimeSecrets();

  const cron = verifyCronSecret(request);
  let detailed = cron.ok;
  if (!detailed) {
    const adminAuth = await requireAdminApiAuth();
    detailed = !("error" in adminAuth);
  }

  let database: "unknown" | "connected" | "error" = "unknown";
  try {
    // Bound the DB probe so readiness/liveness never hangs Playwright or load balancers.
    const admin = await Promise.race([
      createAdminClientAsync(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("health_db_timeout")), 4_000),
      ),
    ]);
    const probe = admin.from("courses").select("id").limit(1);
    const { error } = await Promise.race([
      probe,
      new Promise<{ error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ error: { message: "health_db_timeout" } }), 4_000),
      ),
    ]);
    database = error ? "error" : "connected";
  } catch {
    database = "error";
  }

  if (!detailed) {
    // Application liveness is 200 even when DB is degraded — callers read `status` / `database`.
    // (Returning 503 here previously blocked Playwright webServer readiness forever.)
    return NextResponse.json(
      {
        status: database === "connected" ? "ok" : "degraded",
        database,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

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

  const httpStatus = checks.status === "ok" ? 200 : 503;
  return NextResponse.json(
    {
      ...checks,
      runtimeEnv: runtimeEnvDiagnostics(),
      youtube: await youtubeApiKeyDiagnostics(),
      secrets,
    },
    { status: httpStatus },
  );
}
