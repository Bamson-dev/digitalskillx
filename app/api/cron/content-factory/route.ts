import { NextResponse, type NextRequest } from "next/server";
import {
  continuationDepthFromRequest,
  keepContentFactoryRunning,
} from "@/lib/bulk-import-continue";
import { contentFactoryHasPendingWork } from "@/lib/content-factory/auto-pipeline";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { processContentFactoryJob } from "@/lib/content-factory/process-job";
import { syncCandidatesForJob } from "@/lib/content-factory/generate";
import { runLibraryBuildThroughputTick } from "@/lib/content-factory/library-build/throughput-pipeline";
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
 * Process Content Factory discovery → qualify → generate → publish.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Continuations in keepContentFactoryRunning() POST this route. Without POST,
 * self-chain returns 405 and Library Build stalls after discovery.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!contentFactoryEnabled()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "feature_disabled" });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const depth = continuationDepthFromRequest(request);

  let libraryThroughput: Awaited<ReturnType<typeof runLibraryBuildThroughputTick>> | null = null;
  try {
    libraryThroughput = await runLibraryBuildThroughputTick(admin);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!isMissingRelationError(message)) {
      console.error("[content-factory-cron] library throughput tick failed:", message);
    }
    libraryThroughput = null;
  }

  const qualification = libraryThroughput
    ? {
        processed: libraryThroughput.qualification.runs > 0,
        qualified_count: libraryThroughput.qualification.qualified,
        runs: libraryThroughput.qualification.runs,
      }
    : null;
  const discovery = libraryThroughput?.discovery ?? null;
  const autoGenerate = libraryThroughput
    ? { created: libraryThroughput.generation.created, skipped: libraryThroughput.generation.skipped, runIds: [] }
    : { created: 0, skipped: 0, runIds: [] as string[] };
  let autoPublish = libraryThroughput
    ? {
        published: libraryThroughput.publication.published,
        skipped: libraryThroughput.publication.skipped,
        errors: [] as string[],
      }
    : { published: 0, skipped: 0, errors: [] as string[] };
  const artworkBackfill = libraryThroughput
    ? { updated: libraryThroughput.artworkBackfill.updated }
    : { updated: 0 };
  const libraryBuild = libraryThroughput
    ? {
        ticked: libraryThroughput.discoveryBacklog.created > 0,
        created: libraryThroughput.discoveryBacklog.created,
        reason: libraryThroughput.discoveryBacklog.reasons[0],
        stallRecovery: libraryThroughput.stallRecovery,
      }
    : { ticked: false };

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

  let certificatePricingBackfill: unknown = null;
  try {
    const { backfillLearningPathCertificatePricing } = await import(
      "@/lib/learn-certificate-defaults"
    );
    certificatePricingBackfill = await backfillLearningPathCertificatePricing(admin, 40);
  } catch (err) {
    certificatePricingBackfill = {
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const factoryJobLimit = libraryThroughput?.discoveryBacklog.created
    ? 8
    : (libraryThroughput?.qualification.qualified ?? 0) > 0 ||
        (libraryThroughput?.generation.created ?? 0) > 0
      ? 6
      : 4;
  const { data: claimed, error } = await admin.rpc("claim_content_factory_jobs", {
    p_limit: factoryJobLimit,
  });
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
  let jobProcessed: {
    processed: number;
    jobId?: string;
    job?: unknown;
    generated?: boolean;
  } = { processed: 0 };

  for (const job of jobs) {
    await processContentFactoryJob(admin, job.id);
    await syncCandidatesForJob(admin, job.id);
    const { data: processed } = await admin
      .from("content_factory_jobs")
      .select(JOB_SUMMARY)
      .eq("id", job.id)
      .maybeSingle();
    if (processed?.status === "waiting_review") {
      const { autoPublishReadyLearningPaths } = await import("@/lib/content-factory/auto-pipeline");
      const extraPub = await autoPublishReadyLearningPaths(admin, 6);
      autoPublish = {
        published: autoPublish.published + extraPub.published,
        skipped: autoPublish.skipped + extraPub.skipped,
        errors: [...autoPublish.errors, ...extraPub.errors],
      };
    }
    jobProcessed = {
      processed: jobProcessed.processed + 1,
      jobId: job.id,
      job: processed,
      generated:
        jobProcessed.generated ||
        processed?.status === "waiting_review" ||
        processed?.status === "completed",
    };
  }

  const moreWork =
    (await contentFactoryHasPendingWork(admin)) ||
    Boolean(libraryBuild.ticked) ||
    Boolean(libraryThroughput?.stallRecovery.attempted) ||
    autoGenerate.created > 0 ||
    Boolean((libraryThroughput?.discovery.processed ?? 0) > 0) ||
    jobProcessed.processed > 0 ||
    Boolean(qualification && "processed" in qualification && qualification.processed) ||
    (libraryThroughput?.publication.published ?? 0) > 0;
  keepContentFactoryRunning({
    moreWork,
    depth,
    reason: "content_factory_continue",
  });

  return NextResponse.json({
    ok: true,
    depth,
    chained: moreWork,
    processed: jobProcessed.processed,
    jobId: jobProcessed.jobId,
    job: jobProcessed.job,
    generated: Boolean(jobProcessed.generated) || autoGenerate.created > 0,
    published: autoPublish.published > 0,
    discovery,
    qualification,
    autoGenerate,
    autoPublish,
    artworkBackfill,
    certificatePricingBackfill,
    libraryBuild,
    libraryThroughput,
    counters: {
      jobsProcessed: jobProcessed.processed,
      jobsFailed: 0,
      discoveryRunsProcessed: libraryThroughput?.discovery.processed ?? 0,
      candidatesQualified:
        qualification && "qualified_count" in qualification
          ? Number(qualification.qualified_count ?? 0)
          : 0,
      candidatesGenerated: autoGenerate.created + (jobProcessed.generated ? 1 : 0),
      qualityChecksCompleted: jobProcessed.generated ? 1 : 0,
      autoPublished: autoPublish.published,
      artworkBackfilled: artworkBackfill.updated,
    },
    jobs: await recentJobs(admin),
  });
}
