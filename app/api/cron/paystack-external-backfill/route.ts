import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { backfillRecentAiAppPayments } from "@/lib/paystack-external-refulfill";
import { secureLog } from "@/lib/secure-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Scheduled recovery for Paystack Payment Page (₦14,999) purchases that missed
 * webhook fulfillment during outages or Paystack connectivity blips.
 *
 * Auth: Authorization: Bearer $CRON_SECRET
 * Query: ?limit=10&forceEmail=1
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await bootstrapRuntimeSecrets();

  const limitRaw = Number(request.nextUrl.searchParams.get("limit") ?? "8");
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 8;
  const forceEmail = request.nextUrl.searchParams.get("forceEmail") === "1";

  const result = await backfillRecentAiAppPayments({
    perPage: 50,
    limit,
    forceEmail,
  });

  if (!result.ok) {
    secureLog("error", "cron/paystack-external-backfill", "failed", {
      error: result.error,
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  const newlyFulfilled = result.results.filter((row) => row.ok === true && row.alreadyFulfilled !== true);
  const emailRepaired = result.results.filter((row) => row.ok === true);
  const failed = result.results.filter((row) => row.ok !== true);

  secureLog("info", "cron/paystack-external-backfill", "done", {
    scanned: result.scanned,
    matched: result.matchedAmount,
    newlyFulfilled: newlyFulfilled.length,
    failed: failed.length,
  });

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    matchedAmount: result.matchedAmount,
    newlyFulfilled: newlyFulfilled.length,
    succeeded: emailRepaired.length,
    failed: failed.length,
    results: result.results,
  });
}
