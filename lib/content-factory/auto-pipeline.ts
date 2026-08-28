import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { generateFromQualifiedCandidates } from "@/lib/content-factory/generate";
import { GENERATE_MAX_PER_RUN, GENERATE_MIN_AI_SCORE } from "@/lib/content-factory/generate-shared";
import { approveLearningPathWithVerification } from "@/lib/content-factory/library-build/publish-gate";
import { incrementLibraryBuildStat } from "@/lib/content-factory/library-build/engine";
import { linkPublishedPathToTopic, refreshTopicCoverageCounts, resolveTopicIdForCandidate } from "@/lib/content-factory/library-build/topic-coverage";
import { syncLibraryBuildDiscoveryJobs } from "@/lib/content-factory/library-build/discovery-sync";
import { asStoredQualityReview } from "@/lib/content-factory/quality-shared";
import { syncCandidatesForJob } from "@/lib/content-factory/generate";
import { isMissingRelationError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

/** Auto pipeline is on unless explicitly disabled. */
export function contentFactoryAutoPipelineEnabled(): boolean {
  if (!contentFactoryEnabled()) return false;
  const raw = (process.env.CONTENT_FACTORY_AUTO_PIPELINE ?? "true").trim().toLowerCase();
  return raw !== "0" && raw !== "false" && raw !== "off" && raw !== "no";
}

function autoPublishMinScore(): number {
  const n = Number(process.env.CONTENT_FACTORY_AUTO_PUBLISH_MIN_SCORE);
  if (Number.isFinite(n) && n >= 0) return n;
  return 60;
}

/**
 * After AI qualification, automatically queue factory jobs for the best
 * qualified playlists (up to generate cap / run target).
 */
export async function autoGenerateQualifiedCandidates(
  admin: Admin,
  opts?: { runId?: string; adminId?: string | null; limit?: number },
): Promise<{ created: number; skipped: number; runIds: string[] }> {
  if (!contentFactoryAutoPipelineEnabled()) {
    return { created: 0, skipped: 0, runIds: [] };
  }

  let query = admin
    .from("content_factory_candidates")
    .select("id, run_id, ai_score, status, factory_job_id, learning_path_id, quality_status, final_quality_score")
    .eq("status", "qualified")
    .eq("quality_status", "qualified")
    .is("factory_job_id", null)
    .is("learning_path_id", null)
    .gte("ai_score", GENERATE_MIN_AI_SCORE)
    .order("final_quality_score", { ascending: false, nullsFirst: false })
    .order("ai_score", { ascending: false })
    .limit(opts?.limit ?? 40);

  if (opts?.runId) query = query.eq("run_id", opts.runId);

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) return { created: 0, skipped: 0, runIds: [] };
    throw new Error(error.message);
  }

  const rows = data ?? [];
  if (!rows.length) return { created: 0, skipped: 0, runIds: [] };

  const byRun = new Map<string, string[]>();
  for (const row of rows) {
    const list = byRun.get(row.run_id) ?? [];
    if (list.length >= GENERATE_MAX_PER_RUN) continue;
    list.push(row.id);
    byRun.set(row.run_id, list);
  }

  let adminId = opts?.adminId ?? null;
  if (!adminId) {
    const runId = [...byRun.keys()][0];
    if (runId) {
      const { data: run } = await admin
        .from("content_factory_discovery_runs")
        .select("admin_id")
        .eq("id", runId)
        .maybeSingle();
      adminId = run?.admin_id ?? null;
    }
  }
  if (!adminId) {
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();
    adminId = adminProfile?.id ?? null;
  }
  if (!adminId) return { created: 0, skipped: rows.length, runIds: [] };

  let created = 0;
  let skipped = 0;
  const runIds: string[] = [];

  for (const [runId, candidateIds] of byRun) {
    const result = await generateFromQualifiedCandidates(admin, {
      adminId,
      candidateIds,
    });
    created += result.created.length;
    skipped += result.skipped.length + result.failed.length + result.alreadyGenerated.length;
    if (result.created.length) runIds.push(runId);
  }

  return { created, skipped, runIds };
}

/**
 * Publish learning paths that finished QC cleanly so they appear on /learn.
 */
export async function autoPublishReadyLearningPaths(
  admin: Admin,
  limit = 3,
): Promise<{ published: number; skipped: number; errors: string[] }> {
  if (!contentFactoryAutoPipelineEnabled()) {
    return { published: 0, skipped: 0, errors: [] };
  }

  const minScore = autoPublishMinScore();
  const { data: jobs, error } = await admin
    .from("content_factory_jobs")
    .select("id, learning_path_id, result_snapshot, status")
    .eq("status", "waiting_review")
    .not("learning_path_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(Math.max(5, Math.min(20, limit * 4)));
  if (error) {
    if (isMissingRelationError(error.message)) return { published: 0, skipped: 0, errors: [] };
    throw new Error(error.message);
  }

  let published = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const job of jobs ?? []) {
    if (published >= limit) break;
    const pathId = job.learning_path_id;
    if (!pathId) {
      skipped += 1;
      continue;
    }

    const snap = (job.result_snapshot ?? {}) as {
      qualityScore?: number;
      qualityStatus?: string;
    };
    const { data: path } = await admin
      .from("learning_paths")
      .select("id, status, quality_score, quality_breakdown")
      .eq("id", pathId)
      .maybeSingle();
    if (!path || path.status !== "review") {
      skipped += 1;
      continue;
    }

    const review = asStoredQualityReview(path.quality_breakdown);
    const qualityStatus =
      snap.qualityStatus ||
      review?.status ||
      (path.quality_score != null && path.quality_score >= minScore ? "passed" : null);
    const qualityScore =
      typeof snap.qualityScore === "number"
        ? snap.qualityScore
        : typeof path.quality_score === "number"
          ? path.quality_score
          : 0;

    if (qualityStatus === "needs_revision" || qualityScore < minScore) {
      skipped += 1;
      continue;
    }

    try {
      await approveLearningPathWithVerification(admin, pathId, minScore);
      await syncCandidatesForJob(admin, job.id);

      const { data: pathRow } = await admin
        .from("learning_paths")
        .select("id, source_playlist_id, library_build_topic_id, factory_job_id")
        .eq("id", pathId)
        .maybeSingle();
      if (pathRow && !pathRow.library_build_topic_id) {
        const { data: candidate } = await admin
          .from("content_factory_candidates")
          .select("id, run_id, library_topic_id")
          .eq("learning_path_id", pathId)
          .maybeSingle();
        const topicId = candidate
          ? await resolveTopicIdForCandidate(admin, candidate)
          : null;
        if (topicId) await linkPublishedPathToTopic(admin, pathId, topicId);
      } else if (pathRow?.library_build_topic_id) {
        await linkPublishedPathToTopic(admin, pathId, pathRow.library_build_topic_id);
      }

      published += 1;
      try {
        await incrementLibraryBuildStat(admin, "published_today", 1);
        await refreshTopicCoverageCounts(admin);
        if (pathRow?.factory_job_id) {
          const { data: cand } = await admin
            .from("content_factory_candidates")
            .select("run_id")
            .eq("factory_job_id", pathRow.factory_job_id)
            .maybeSingle();
          if (cand?.run_id) await syncLibraryBuildDiscoveryJobs(admin, { runId: cand.run_id });
        }
      } catch {
        /* library build tables optional */
      }
    } catch (err) {
      skipped += 1;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { published, skipped, errors };
}

/** True when cron should chain another tick. */
export async function contentFactoryHasPendingWork(admin: Admin): Promise<boolean> {
  const checks = await Promise.all([
    admin
      .from("content_factory_discovery_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued"),
    admin
      .from("content_factory_discovery_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "running"),
    admin
      .from("content_factory_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("content_factory_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),
    admin
      .from("content_factory_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "qualified")
      .is("factory_job_id", null),
    admin
      .from("content_factory_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "discovered"),
  ]);

  for (const res of checks) {
    if (res.error && !isMissingRelationError(res.error.message)) {
      // Prefer chaining on unexpected errors so work is not abandoned.
      return true;
    }
    if ((res.count ?? 0) > 0) return true;
  }

  try {
    const { data: lbSettings } = await admin
      .from("library_build_settings")
      .select("run_status, build_mode")
      .eq("id", "default")
      .maybeSingle();
    if (lbSettings?.run_status === "running" && lbSettings.build_mode !== "stopped") {
      return true;
    }
    const { count: lbJobs } = await admin
      .from("library_build_discovery_jobs")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "running"]);
    if ((lbJobs ?? 0) > 0) return true;
  } catch {
    /* library build optional */
  }

  return false;
}
