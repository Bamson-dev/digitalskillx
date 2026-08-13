import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { processContentFactoryJob } from "@/lib/content-factory/process-job";
import { processQueuedDiscoveryRun } from "@/lib/content-factory/discovery";
import { processPendingQualification } from "@/lib/content-factory/qualify";
import { syncCandidatesForJob } from "@/lib/content-factory/generate";
import { approveLearningPath } from "@/lib/content-factory/learning-paths";
import { isMissingRelationError } from "@/lib/schema-guard";
import { FACTORY_RETRY_MAX_ATTEMPTS, isRetryableFactoryError } from "@/lib/content-factory/ops-shared";
import type { ContentFactoryJob } from "@/types/database";

const JOB_SUMMARY =
  "id, status, phase, progress, error_message, learning_path_id, input_value, result_snapshot, updated_at";

async function recentJobs(admin: Awaited<ReturnType<typeof createAdminClientAsync>>) {
  const { data } = await admin
    .from("content_factory_jobs")
    .select(JOB_SUMMARY)
    .order("updated_at", { ascending: false })
    .limit(8);
  return data ?? [];
}

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

  const approveJobId = request.nextUrl.searchParams.get("approve");
  if (approveJobId) {
    const { data: job, error: jobError } = await admin
      .from("content_factory_jobs")
      .select("id, learning_path_id, status")
      .eq("id", approveJobId)
      .maybeSingle();
    if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
    if (!job?.learning_path_id) {
      return NextResponse.json({ error: "Job has no learning path to approve." }, { status: 400 });
    }
    try {
      const path = await approveLearningPath(admin, job.learning_path_id);
      await syncCandidatesForJob(admin, job.id);
      return NextResponse.json({
        ok: true,
        approved: true,
        slug: path.slug,
        status: path.status,
        jobs: await recentJobs(admin),
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Approve failed" },
        { status: 400 },
      );
    }
  }

  const discovery = await processQueuedDiscoveryRun(admin);

  // Requeue infrastructure/AI failures that never created a path (e.g. DeepSeek 403).
  const { data: failedJobs } = await admin
    .from("content_factory_jobs")
    .select("id, error_message, attempts")
    .eq("status", "failed")
    .is("learning_path_id", null)
    .lt("attempts", 3)
    .limit(5);

  const retryable = (failedJobs ?? []).filter((job) => isRetryableFactoryError(job.error_message));
  if (retryable.length) {
    await admin
      .from("content_factory_jobs")
      .update({
        status: "pending",
        phase: "queued",
        progress: 0,
        error_message: null,
        last_error: null,
        started_at: null,
        claimed_at: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .in(
        "id",
        retryable.map((job) => job.id),
      );
  }

  // Reclaim jobs stuck in processing (worker crash / timeout).
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  await admin
    .from("content_factory_jobs")
    .update({
      status: "pending",
      phase: "queued",
      progress: 0,
      error_message: "Job timed out while processing and was reclaimed.",
      last_error: "stale_processing_reclaim",
      started_at: null,
      claimed_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("status", "processing")
    .lt("claimed_at", staleBefore)
    .lt("attempts", FACTORY_RETRY_MAX_ATTEMPTS);
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
    .lt("claimed_at", staleBefore)
    .gte("attempts", FACTORY_RETRY_MAX_ATTEMPTS);

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
  if (jobs.length) {
    const job = jobs[0]!;
    await processContentFactoryJob(admin, job.id);
    await syncCandidatesForJob(admin, job.id);
    const { data: processed } = await admin
      .from("content_factory_jobs")
      .select(JOB_SUMMARY)
      .eq("id", job.id)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      processed: 1,
      jobId: job.id,
      job: processed,
      generated: processed?.status === "waiting_review" || processed?.status === "completed",
      published: false,
      discovery,
      qualification: { skipped: true, reason: "playlist_job_priority" },
      counters: {
        jobsProcessed: 1,
        jobsFailed: processed?.status === "failed" ? 1 : 0,
        discoveryRunsProcessed: discovery && "processed" in discovery && discovery.processed ? 1 : 0,
        candidatesQualified: 0,
        candidatesGenerated: processed?.status === "waiting_review" || processed?.status === "completed" ? 1 : 0,
        qualityChecksCompleted: processed?.status === "waiting_review" || processed?.status === "completed" ? 1 : 0,
      },
      jobs: await recentJobs(admin),
    });
  }

  const qualification = await processPendingQualification(admin);
  return NextResponse.json({
    ok: true,
    processed: 0,
    generated: false,
    published: false,
    discovery,
    qualification,
    counters: {
      jobsProcessed: 0,
      jobsFailed: 0,
      discoveryRunsProcessed: discovery && "processed" in discovery && discovery.processed ? 1 : 0,
      candidatesQualified: "qualified_count" in (qualification ?? {}) ? Number((qualification as { qualified_count?: number }).qualified_count ?? 0) : 0,
      candidatesGenerated: 0,
      qualityChecksCompleted: 0,
    },
    jobs: await recentJobs(admin),
  });
}
