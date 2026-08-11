import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { processContentFactoryJob } from "@/lib/content-factory/process-job";
import { isMissingRelationError } from "@/lib/schema-guard";
import type { ContentFactoryJob } from "@/types/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Process pending Content Factory jobs.
 * Auth: Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!contentFactoryEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "feature_disabled" });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();

  // Reclaim jobs stuck in processing (worker crash / timeout).
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await admin
    .from("content_factory_jobs")
    .update({
      status: "failed",
      phase: "failed",
      error_message: "Job timed out while processing and was reclaimed.",
      last_error: "stale_processing_reclaim",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("claimed_at", staleBefore);

  const { data: claimed, error } = await admin.rpc("claim_content_factory_jobs", { p_limit: 1 });
  if (error) {
    if (isMissingRelationError(error.message)) {
      return NextResponse.json({
        error: "content_factory_jobs missing — apply migration 0042",
        processed: 0,
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const jobs = (claimed ?? []) as ContentFactoryJob[];
  if (!jobs.length) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const job = jobs[0]!;
  await processContentFactoryJob(admin, job.id);
  return NextResponse.json({ ok: true, processed: 1, jobId: job.id });
}
