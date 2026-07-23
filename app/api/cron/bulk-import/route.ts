import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { processPendingBulkImportJobs } from "@/lib/bulk-import-job";
import { drainBulkImportEmailOutbox } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Background worker for bulk CSV import jobs.
 * Auth: Authorization: Bearer CRON_SECRET
 * Also drains a batch of email outbox after row processing.
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

  try {
    const jobs = await processPendingBulkImportJobs(admin, {
      maxJobs: 3,
      budgetMs: 90_000,
    });
    const email = await drainBulkImportEmailOutbox(admin, 40);
    bulkImportStage("cron_bulk_import_tick", {
      ok: true,
      durationMs: Date.now() - started,
      jobs: jobs.length,
      emailsSent: email.sent,
      emailsFailed: email.failed,
    });
    return NextResponse.json({
      ok: true,
      jobsProcessed: jobs.length,
      jobs: jobs.map((j) => ({
        jobId: j.jobId,
        phase: j.phase,
        processedRows: j.processedRows,
        totalRows: j.totalRows,
        done: j.done,
        failed: j.failed,
      })),
      emails: email,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bulkImportStage("cron_bulk_import_tick", { ok: false, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
