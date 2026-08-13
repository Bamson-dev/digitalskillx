import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentFactoryCandidate, Database } from "@/types/database";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { isContentFactoryBlocked } from "@/lib/content-factory/blocks";
import { createContentFactoryJob } from "@/lib/content-factory/jobs";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  candidateStatusFromFactory,
  evaluateGenerateEligibility,
  generateMaxPerRunFromEnv,
  isGeneratedCandidate,
  normalizeCandidateIds,
} from "@/lib/content-factory/generate-shared";

type Admin = SupabaseClient<Database>;
type CandidateRow = ContentFactoryCandidate;

export type GenerateResultItem = {
  candidateId: string;
  playlistId?: string;
  jobId?: string;
  learningPathId?: string | null;
  status?: string;
  reason?: string;
};

function generateCap(): number {
  return generateMaxPerRunFromEnv(process.env.CONTENT_FACTORY_GENERATE_MAX_PER_RUN);
}

async function loadCandidate(admin: Admin, id: string): Promise<CandidateRow | null> {
  const { data, error } = await admin.from("content_factory_candidates").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new Error("Content Factory discovery tables missing — apply migration 0043.");
    }
    throw new Error(error.message);
  }
  return data as CandidateRow | null;
}

async function findExistingPath(admin: Admin, playlistId: string) {
  const { data } = await admin
    .from("learning_paths")
    .select("id, status, slug")
    .eq("source_playlist_id", playlistId)
    .in("status", ["draft", "review", "published"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function findExistingJob(admin: Admin, playlistId: string) {
  const { data } = await admin
    .from("content_factory_jobs")
    .select("id, status, learning_path_id, input_value")
    .eq("input_value", playlistId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function loadPath(admin: Admin, pathId: string | null | undefined) {
  if (!pathId) return null;
  const { data } = await admin.from("learning_paths").select("id, status").eq("id", pathId).maybeSingle();
  return data;
}

async function loadJob(admin: Admin, jobId: string | null | undefined) {
  if (!jobId) return null;
  const { data } = await admin
    .from("content_factory_jobs")
    .select("id, status, learning_path_id")
    .eq("id", jobId)
    .maybeSingle();
  return data;
}

async function updateCandidateLink(
  admin: Admin,
  candidate: CandidateRow,
  patch: {
    status: ContentFactoryCandidate["status"];
    factory_job_id?: string | null;
    learning_path_id?: string | null;
  },
) {
  const { error } = await admin
    .from("content_factory_candidates")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);
  if (error) throw new Error(error.message);
}

async function recountGenerated(admin: Admin, runId: string) {
  const { data, error } = await admin
    .from("content_factory_candidates")
    .select("id, status, factory_job_id, learning_path_id")
    .eq("run_id", runId);
  if (error) throw new Error(error.message);
  const generated_count = (data ?? []).filter((row) => isGeneratedCandidate(row)).length;
  const { error: updateError } = await admin
    .from("content_factory_discovery_runs")
    .update({ generated_count })
    .eq("id", runId);
  if (updateError) throw new Error(updateError.message);
  return generated_count;
}

export async function syncCandidateFactoryState(admin: Admin, candidate: CandidateRow) {
  const job = await loadJob(admin, candidate.factory_job_id);
  const pathId = candidate.learning_path_id || job?.learning_path_id || null;
  const path = await loadPath(admin, pathId);
  const status = candidateStatusFromFactory({
    jobStatus: job?.status,
    pathStatus: path?.status,
    learningPathId: path?.id ?? pathId,
  });
  const nextJobId = job?.id ?? candidate.factory_job_id;
  const nextPathId = path?.id ?? candidate.learning_path_id;
  if (
    status === candidate.status &&
    nextJobId === candidate.factory_job_id &&
    nextPathId === candidate.learning_path_id
  ) {
    return candidate;
  }
  await updateCandidateLink(admin, candidate, {
    status,
    factory_job_id: nextJobId,
    learning_path_id: nextPathId,
  });
  return {
    ...candidate,
    status,
    factory_job_id: nextJobId ?? null,
    learning_path_id: nextPathId ?? null,
  };
}

export async function syncCandidatesForJob(admin: Admin, jobId: string) {
  const { data, error } = await admin
    .from("content_factory_candidates")
    .select("*")
    .eq("factory_job_id", jobId);
  if (error) {
    if (isMissingRelationError(error.message)) return;
    throw new Error(error.message);
  }
  for (const row of (data ?? []) as CandidateRow[]) {
    await syncCandidateFactoryState(admin, row);
    await recountGenerated(admin, row.run_id);
  }
}

export async function syncCandidatesForRun(admin: Admin, runId: string) {
  const { data, error } = await admin
    .from("content_factory_candidates")
    .select("*")
    .eq("run_id", runId);
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  const updated: CandidateRow[] = [];
  for (const row of (data ?? []) as CandidateRow[]) {
    if (row.factory_job_id || row.learning_path_id || row.status === "generating") {
      updated.push(await syncCandidateFactoryState(admin, row));
    } else {
      updated.push(row);
    }
  }
  await recountGenerated(admin, runId);
  return updated;
}

async function isBlockedCandidate(admin: Admin, candidate: CandidateRow): Promise<boolean> {
  if (await isContentFactoryBlocked(admin, "playlist_id", candidate.playlist_id)) return true;
  if (candidate.channel_id && (await isContentFactoryBlocked(admin, "channel_id", candidate.channel_id))) {
    return true;
  }
  return false;
}

export async function generateFromQualifiedCandidates(
  admin: Admin,
  params: { adminId: string; candidateIds: unknown },
) {
  if (!contentFactoryEnabled()) {
    throw new Error("Content Factory is disabled.");
  }

  const normalized = normalizeCandidateIds(params.candidateIds);
  if (normalized.error) throw new Error(normalized.error);

  const created: GenerateResultItem[] = [];
  const alreadyGenerated: GenerateResultItem[] = [];
  const skipped: GenerateResultItem[] = [];
  const failed: GenerateResultItem[] = [];

  const cap = generateCap();
  const generatedByRun = new Map<string, number>();

  async function runGeneratedCount(runId: string) {
    if (generatedByRun.has(runId)) return generatedByRun.get(runId)!;
    const count = await recountGenerated(admin, runId);
    generatedByRun.set(runId, count);
    return count;
  }

  for (const candidateId of normalized.ids) {
    try {
      const candidate = await loadCandidate(admin, candidateId);
      const blocked = candidate ? await isBlockedCandidate(admin, candidate) : false;
      let decision = evaluateGenerateEligibility({ candidate, blocked });

      if (candidate && decision.action === "create") {
        const existingPath = await findExistingPath(admin, candidate.playlist_id);
        const existingJob = await findExistingJob(admin, candidate.playlist_id);
        if (existingPath) {
          await updateCandidateLink(admin, candidate, {
            status: existingPath.status === "published" ? "published" : "review",
            learning_path_id: existingPath.id,
            factory_job_id: existingJob?.id ?? candidate.factory_job_id,
          });
          alreadyGenerated.push({
            candidateId,
            playlistId: candidate.playlist_id,
            jobId: existingJob?.id,
            learningPathId: existingPath.id,
            status: existingPath.status === "published" ? "published" : "review",
            reason: "already_has_path",
          });
          continue;
        }
        if (existingJob) {
          const path = await loadPath(admin, existingJob.learning_path_id);
          const status = candidateStatusFromFactory({
            jobStatus: existingJob.status,
            pathStatus: path?.status,
            learningPathId: path?.id ?? existingJob.learning_path_id,
          });
          await updateCandidateLink(admin, candidate, {
            status,
            factory_job_id: existingJob.id,
            learning_path_id: existingJob.learning_path_id,
          });
          alreadyGenerated.push({
            candidateId,
            playlistId: candidate.playlist_id,
            jobId: existingJob.id,
            learningPathId: existingJob.learning_path_id,
            status,
            reason: "already_has_job",
          });
          continue;
        }
      }

      if (decision.action === "already" && candidate) {
        const synced = await syncCandidateFactoryState(admin, candidate);
        alreadyGenerated.push({
          candidateId,
          playlistId: candidate.playlist_id,
          jobId: synced.factory_job_id ?? undefined,
          learningPathId: synced.learning_path_id,
          status: synced.status,
          reason: decision.reason,
        });
        continue;
      }

      if (decision.action === "skip" || !candidate) {
        skipped.push({ candidateId, reason: decision.action === "skip" ? decision.reason : "not_found" });
        continue;
      }

      const used = await runGeneratedCount(candidate.run_id);
      if (used >= cap) {
        skipped.push({
          candidateId,
          playlistId: candidate.playlist_id,
          reason: "run_cap",
        });
        continue;
      }

      const job = await createContentFactoryJob(admin, {
        adminId: params.adminId,
        inputType: "playlist_id",
        inputValue: candidate.playlist_id,
      });
      await updateCandidateLink(admin, candidate, {
        status: "generating",
        factory_job_id: job.id,
        learning_path_id: job.learning_path_id,
      });
      generatedByRun.set(candidate.run_id, used + 1);
      await recountGenerated(admin, candidate.run_id);
      created.push({
        candidateId,
        playlistId: candidate.playlist_id,
        jobId: job.id,
        learningPathId: job.learning_path_id,
        status: "generating",
      });
    } catch (err) {
      failed.push({
        candidateId,
        reason: err instanceof Error ? err.message : "Job creation failed.",
      });
    }
  }

  return {
    requested: normalized.requested,
    created,
    alreadyGenerated,
    skipped,
    failed,
    cap,
  };
}
