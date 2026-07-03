import { NextResponse } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { paystackSecretKeyConfigured } from "@/lib/env-paystack";
import { youtubeApiKeyDiagnostics } from "@/lib/env-youtube";
import { runtimeEnvDiagnostics } from "@/lib/runtime-env";
import { isServiceRoleConfigured, createAdminClientAsync } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await bootstrapRuntimeSecrets();

  const youtube = await youtubeApiKeyDiagnostics();
  const paystackReady = await paystackSecretKeyConfigured();

  const checks: Record<string, string> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    database: "unknown",
    paystack: paystackReady ? "configured" : "unconfigured",
    youtubeApiKey: youtube.status,
    youtubeApiKeySource: youtube.source,
    supabaseServiceRole: isServiceRoleConfigured() ? "configured" : "missing",
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
    },
    { status: httpStatus },
  );
}
