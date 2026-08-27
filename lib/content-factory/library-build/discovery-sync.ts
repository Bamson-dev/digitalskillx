import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LibraryBuildSettings } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  aggregateCandidateCounts,
  buildSyncFingerprint,
  dailyStatDeltasFromSync,
  mapDiscoveryRunToJobStatus,
  retryEligibleDiscoveryJob,
  shouldApplyDailyStatDelta,
  type LibraryDiscoveryJobStatus,
} from "@/lib/content-factory/library-build/discovery-sync-shared";
import { LIBRARY_BUILD_MAX_RETRIES } from "@/lib/content-factory/library-build/library-build-shared";
import { logLibraryBuildActivity } from "@/lib/content-factory/library-build/engine";
import { statsDayKey, resetDailyStatsIfNeeded } from "@/lib/content-factory/library-build/library-build-shared";

type Admin = SupabaseClient<Database>;

function tablesMissing(message: string) {
  return isMissingRelationError(message);
}

async function loadSettings(admin: Admin) {
  const { data, error } = await admin.from("library_build_settings").select("*").eq("id", "default").maybeSingle();
  if (error) {
    if (tablesMissing(error.message)) return null;
    throw new Error(error.message);
  }
  return data;
}

export async function syncLibraryBuildDiscoveryJob(
  admin: Admin,
  jobId: string,
): Promise<{ synced: boolean; skipped: boolean; status?: LibraryDiscoveryJobStatus }> {
  const { data: job, error } = await admin
    .from("library_build_discovery_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) {
    if (tablesMissing(error.message)) return { synced: false, skipped: true };
    throw new Error(error.message);
  }
  if (!job?.discovery_run_id) return { synced: false, skipped: true };

  const { data: run, error: runError } = await admin
    .from("content_factory_discovery_runs")
    .select("*")
    .eq("id", job.discovery_run_id)
    .maybeSingle();
  if (runError) throw new Error(runError.message);
  if (!run) return { synced: false, skipped: true };

  const { data: candidates } = await admin
    .from("content_factory_candidates")
    .select("id, status, filter_reason, quality_status, factory_job_id, learning_path_id")
    .eq("run_id", run.id);

  const pathIds = (candidates ?? [])
    .map((c) => c.learning_path_id)
    .filter((id): id is string => Boolean(id));
  const pathsByCandidate = new Map<string, string>();
  if (pathIds.length) {
    const { data: paths } = await admin.from("learning_paths").select("id, status").in("id", pathIds);
    for (const p of paths ?? []) pathsByCandidate.set(p.id, p.status);
  }

  const counts = aggregateCandidateCounts(candidates ?? [], pathsByCandidate);
  const nextStatus = mapDiscoveryRunToJobStatus(run.status, run.error_message);
  const fingerprint = buildSyncFingerprint({
    runId: run.id,
    runStatus: run.status,
    runCompletedAt: run.completed_at,
    counts,
  });

  if (job.sync_fingerprint === fingerprint) {
    return { synced: false, skipped: true, status: nextStatus };
  }

  const applyStats = shouldApplyDailyStatDelta(job.sync_fingerprint, fingerprint, job.status, nextStatus);
  const deltas = dailyStatDeltasFromSync({
    counts,
    status: nextStatus,
    previousStatus: job.status,
    applyStats,
  });

  const startedAt = job.started_at ?? (run.status !== "queued" ? run.created_at : null);
  const completedAt =
    run.completed_at ??
    (["completed", "failed", "cancelled"].includes(run.status) ? new Date().toISOString() : null);

  await admin
    .from("library_build_discovery_jobs")
    .update({
      status: nextStatus,
      candidates_found: counts.discovered + counts.filtered,
      candidates_rejected: counts.rejected,
      candidates_qualified: counts.qualified,
      candidates_duplicates: counts.duplicates,
      candidates_approved: counts.qualified,
      courses_generated: counts.generated,
      courses_published: counts.published,
      error_message: run.error_message,
      sync_fingerprint: fingerprint,
      synced_at: new Date().toISOString(),
      started_at: startedAt,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
      retry_count:
        nextStatus === "rate_limited" || nextStatus === "quota_limited"
          ? job.retry_count + (applyStats ? 1 : 0)
          : job.retry_count,
    })
    .eq("id", job.id);

  if (applyStats) {
    const settings = await loadSettings(admin);
    if (settings) {
      const today = statsDayKey();
      let base = settings;
      if (resetDailyStatsIfNeeded(settings.stats_day, today)) {
        const { data } = await admin
          .from("library_build_settings")
          .update({
            stats_day: today,
            candidates_today: 0,
            approved_today: 0,
            published_today: 0,
            rejected_today: 0,
            jobs_started_today: 0,
            jobs_completed_today: 0,
            jobs_failed_today: 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", "default")
          .select("*")
          .single();
        base = data ?? settings;
      }
      await admin
        .from("library_build_settings")
        .update({
          candidates_today: (base.candidates_today ?? 0) + deltas.candidatesToday,
          approved_today: (base.approved_today ?? 0) + deltas.approvedToday,
          rejected_today: (base.rejected_today ?? 0) + deltas.rejectedToday,
          published_today: (base.published_today ?? 0) + deltas.publishedToday,
          jobs_started_today: (base.jobs_started_today ?? 0) + deltas.jobsStartedToday,
          jobs_completed_today: (base.jobs_completed_today ?? 0) + deltas.jobsCompletedToday,
          jobs_failed_today: (base.jobs_failed_today ?? 0) + deltas.jobsFailedToday,
          duplicates_blocked_total: (base.duplicates_blocked_total ?? 0) + counts.duplicates,
          rejected_candidates_total: (base.rejected_candidates_total ?? 0) + counts.rejected,
          failed_jobs_total:
            (base.failed_jobs_total ?? 0) +
            (nextStatus === "failed" || nextStatus === "quota_limited" || nextStatus === "rate_limited"
              ? applyStats
                ? 1
                : 0
              : 0),
          updated_at: new Date().toISOString(),
        })
        .eq("id", "default");
    }

    if (nextStatus === "failed" || nextStatus === "quota_limited" || nextStatus === "rate_limited") {
      await logLibraryBuildActivity(admin, {
        kind: "discovery_job_failed",
        message: `Discovery job ${job.id} ended: ${nextStatus}`,
        details: { jobId: job.id, runId: run.id, error: run.error_message, counts },
      });
    } else if (nextStatus === "completed") {
      await logLibraryBuildActivity(admin, {
        kind: "discovery_job_completed",
        message: `Discovery job ${job.id} completed`,
        details: { jobId: job.id, runId: run.id, counts },
      });
    }
  }

  return { synced: true, skipped: false, status: nextStatus };
}

export async function syncLibraryBuildDiscoveryJobs(
  admin: Admin,
  opts?: { runId?: string; limit?: number },
): Promise<{ synced: number; skipped: number; jobs: string[] }> {
  const base = admin
    .from("library_build_discovery_jobs")
    .select("id, status, discovery_run_id, sync_fingerprint, retry_count, updated_at")
    .not("discovery_run_id", "is", null);

  const query = opts?.runId
    ? base.eq("discovery_run_id", opts.runId)
    : base
        .in("status", ["queued", "running", "rate_limited", "quota_limited", "completed", "failed"])
        .order("updated_at", { ascending: true })
        .limit(opts?.limit ?? 20);

  const { data: jobs, error } = await query;
  if (error) {
    if (tablesMissing(error.message)) return { synced: 0, skipped: 0, jobs: [] };
    throw new Error(error.message);
  }

  let synced = 0;
  let skipped = 0;
  const ids: string[] = [];

  for (const job of jobs ?? []) {
    if (
      (job.status === "rate_limited" || job.status === "quota_limited") &&
      !retryEligibleDiscoveryJob({
        status: job.status as LibraryDiscoveryJobStatus,
        retryCount: job.retry_count ?? 0,
        maxRetries: LIBRARY_BUILD_MAX_RETRIES,
        lastUpdatedAt: job.updated_at,
      })
    ) {
      skipped += 1;
      continue;
    }
    const result = await syncLibraryBuildDiscoveryJob(admin, job.id);
    ids.push(job.id);
    if (result.synced) synced += 1;
    else skipped += 1;
  }

  return { synced, skipped, jobs: ids };
}

export async function markLibraryJobRunningForRun(admin: Admin, runId: string) {
  try {
    await admin
      .from("library_build_discovery_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("discovery_run_id", runId)
      .in("status", ["queued"]);
  } catch {
    /* optional */
  }
}
