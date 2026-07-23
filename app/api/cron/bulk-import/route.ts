import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { processPendingBulkImportJobs } from "@/lib/bulk-import-job";
import { drainBulkImportEmailOutbox } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";
import {
  continuationDepthFromRequest,
  scheduleBulkWorkerContinuation,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Background worker for bulk CSV import jobs.
 * Auth: Authorization: Bearer CRON_SECRET
 * Bounded batch per invocation; self-chains when more work remains (Hobby-safe).
 */
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
  const started = Date.now();
  const depth = continuationDepthFromRequest(request);
  const origin = new URL(request.url).origin;

  try {
    const jobs = await processPendingBulkImportJobs(admin, {
      maxJobs: 2,
      budgetMs: 55_000,
    });
    const email = await drainBulkImportEmailOutbox(admin, 25);

    const stillWorking = jobs.some(
      (j) => !j.done || (j.pendingRows ?? 0) > 0 || (j.processingRows ?? 0) > 0,
    );
    const emailsTouched = email.sent + email.failed > 0;

    if (stillWorking) {
      scheduleBulkWorkerContinuation({
        origin,
        path: "/api/cron/bulk-import",
        depth,
        reason: "rows_remaining",
      });
    } else if (jobs.length > 0 || emailsTouched) {
      // After row work finishes (or when outbox was touched), drain emails
      scheduleBulkWorkerContinuation({
        origin,
        path: "/api/cron/email-outbox",
        depth: 0,
        reason: "drain_emails",
      });
    }

    bulkImportStage("cron_bulk_import_tick", {
      ok: true,
      durationMs: Date.now() - started,
      jobs: jobs.length,
      depth,
      emailsSent: email.sent,
      emailsFailed: email.failed,
      chained: stillWorking,
    });

    return NextResponse.json({
      ok: true,
      depth,
      chained: stillWorking,
      jobsProcessed: jobs.length,
      jobs: jobs.map((j) => ({
        jobId: j.jobId,
        phase: j.phase,
        processedRows: j.processedRows,
        totalRows: j.totalRows,
        pendingRows: j.pendingRows,
        processingRows: j.processingRows,
        done: j.done,
        failed: j.failed,
      })),
      emails: email,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bulkImportStage("cron_bulk_import_tick", { ok: false, error: message, depth });
    return NextResponse.json({ ok: false, error: message, depth }, { status: 500 });
  }
}
