import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  countGlobalPendingOutbox,
  countPendingOutboxForJob,
  drainBulkImportEmailOutboxUntilBudget,
} from "@/lib/bulk-import-email-outbox";
import { maybeFinalizeJobPhase } from "@/lib/bulk-import-job";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";
import {
  continuationDepthFromRequest,
  scheduleBulkWorkerContinuation,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Drain bulk-import email outbox. Auth: Bearer CRON_SECRET */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const depth = continuationDepthFromRequest(request);
  const origin = new URL(request.url).origin;
  const jobId = new URL(request.url).searchParams.get("jobId")?.trim() || undefined;

  try {
    const result = await drainBulkImportEmailOutboxUntilBudget(admin, {
      jobId,
      batchSize: 40,
      budgetMs: 100_000,
    });

    if (jobId) {
      await maybeFinalizeJobPhase(admin, jobId);
    }

    const remaining = jobId
      ? (await countPendingOutboxForJob(admin, jobId)).total
      : await countGlobalPendingOutbox(admin);
    const more = remaining > 0;

    if (more) {
      scheduleBulkWorkerContinuation({
        origin,
        path: "/api/cron/email-outbox",
        depth,
        jobId,
        reason: "more_outbox",
      });
    }

    bulkImportStage("cron_email_outbox_tick", {
      ok: true,
      depth,
      chained: more,
      jobId,
      remaining,
      ...result,
    });
    return NextResponse.json({ ok: true, depth, chained: more, jobId, remaining, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bulkImportStage("cron_email_outbox_tick", { ok: false, error: message, depth, jobId });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
