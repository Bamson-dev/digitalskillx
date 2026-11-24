import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { secureLog } from "@/lib/secure-log";
import { isMissingRelationError } from "@/lib/schema-guard";
import { buildRecoveryDeps } from "@/lib/payment-recovery/server";
import { runRecoveryCycle } from "@/lib/payment-recovery/engine";
import { pullPaymentPageAttempts } from "@/lib/payment-recovery/page-pull";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Payment recovery cycle: verify unresolved Paystack references, then send due
 * recovery emails. Run every 5 minutes. Auth: Authorization: Bearer $CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  await bootstrapRuntimeSecrets();
  const { db, deps, admin } = await buildRecoveryDeps();
  if (!deps.config.enabled) {
    return NextResponse.json({ enabled: false, note: "Set PAYMENT_RECOVERY_ENABLED=true to start recovery." });
  }
  try {
    const pagePull = await pullPaymentPageAttempts(db, deps, admin);
    const result = await runRecoveryCycle(db, deps);
    secureLog("info", "cron/payment-recovery", "done", {
      pagePull,
      reconcile: result.reconcile,
      messages: result.messages,
    } as unknown as Record<string, unknown>);
    return NextResponse.json({ enabled: true, pagePull, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(message)) {
      return NextResponse.json({ error: "Apply supabase/migrations/0058_payment_recovery.sql first." }, { status: 503 });
    }
    secureLog("error", "cron/payment-recovery", "failed", { error: message.slice(0, 200) });
    return NextResponse.json({ error: "Recovery cycle failed." }, { status: 500 });
  }
}
