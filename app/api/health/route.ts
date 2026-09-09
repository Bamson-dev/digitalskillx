import { NextResponse, type NextRequest } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { verifyCronSecret } from "@/lib/cron-auth";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { runtimeEnv, runtimeEnvDiagnostics } from "@/lib/runtime-env";
import { getServiceRoleKeySync } from "@/lib/env-service-role";
import { supabaseProjectRef } from "@/lib/supabase-project-ref";
import { configuredAdminEmail } from "@/lib/admin-email";
import { probeDatabaseConnectionDetailed } from "@/lib/health-database-probe";
import { getServerSupabaseUrl } from "@/lib/supabase/url";

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
  const databaseProbe = await probeDatabaseConnectionDetailed();
  const database = databaseProbe.status;

  // Env-only extras — never open long-retry Supabase clients here (that hung
  // Contabo detailed health for 20–60s when Kong was slow/unreachable).
  const youtubeKey = runtimeEnv("YOUTUBE_API_KEY")?.trim();
  const paystackEnv = Boolean(runtimeEnv("PAYSTACK_SECRET_KEY")?.trim());
  const serviceRoleReady = Boolean(getServiceRoleKeySync());
  const serverUrl = getServerSupabaseUrl() ?? "";
  const serverUrlHost = (() => {
    try {
      return new URL(serverUrl).host;
    } catch {
      return serverUrl ? "configured" : "missing";
    }
  })();

  const { getContaboIntegrationStatus } = await import("@/lib/storage");
  const contabo = getContaboIntegrationStatus();

  const checks: Record<string, string> = {
    status: database === "connected" ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    deployment: process.env.COOLIFY_RESOURCE_UUID
      ? "coolify"
      : process.env.VERCEL === "1"
        ? "vercel"
        : "unknown",
    database,
    databaseDetail: databaseProbe.detail ?? "",
    paystack: paystackEnv ? "configured" : "unconfigured",
    contabo: contabo.configured ? "configured" : "unconfigured",
    contaboProvider: contabo.provider,
    youtubeApiKey: youtubeKey
      ? youtubeKey === "your-youtube-data-api-key"
        ? "placeholder"
        : "ok"
      : "missing",
    youtubeApiKeySource: youtubeKey ? "process" : "missing",
    supabaseServiceRole: serviceRoleReady ? "configured" : "missing",
    supabaseProjectRef: supabaseProjectRef() ?? "unknown",
    supabaseUrlConfigured: process.env.NEXT_PUBLIC_SUPABASE_URL ? "yes" : "no",
    supabaseServerHost: serverUrlHost,
    adminEmail: configuredAdminEmail(),
  };

  if (paystackEnv) {
    try {
      const secret = runtimeEnv("PAYSTACK_SECRET_KEY")!.trim();
      const res = await fetch("https://api.paystack.co/transaction/totals", {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
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
    },
    { status: 200 },
  );
}
