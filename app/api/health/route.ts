import { NextResponse } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { youtubeApiKeyDiagnostics } from "@/lib/env-youtube";
import { runtimeEnvDiagnostics } from "@/lib/runtime-env";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { serviceRoleKeyConfigured } from "@/lib/env-service-role";
import { integrationSecretsDiagnostics } from "@/lib/secrets-diagnostics";
import { supabaseProjectRef } from "@/lib/supabase-project-ref";
import { configuredAdminEmail } from "@/lib/admin-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await bootstrapRuntimeSecrets();

  const youtube = await youtubeApiKeyDiagnostics();
  const paystackReady = await paystackSecretKeyConfigured();
  const secrets = await integrationSecretsDiagnostics();
  const serviceRoleReady = await serviceRoleKeyConfigured();

  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    deployment: secrets.deployment,
    database: "unknown",
    paystack: paystackReady ? "configured" : "unconfigured",
    youtubeApiKey: youtube.status,
    youtubeApiKeySource: youtube.source,
    supabaseServiceRole: serviceRoleReady ? "configured" : "missing",
    supabaseProjectRef: supabaseProjectRef() ?? "unknown",
    supabaseUrlConfigured: process.env.NEXT_PUBLIC_SUPABASE_URL ? "yes" : "no",
    adminEmail: configuredAdminEmail(),
    cronBootstrap: secrets.cronBootstrap,
  };

  try {
    const admin = await createAdminClientAsync();
    const { error } = await admin.from("courses").select("id").limit(1);
    checks.database = error ? "error" : "connected";
  } catch {
    checks.database = "error";
    checks.status = "degraded";
  }

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
