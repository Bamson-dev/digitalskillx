import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ContentFactoryJob } from "@/types/database";
import type { Json } from "@/types/database";
import {
  parseYoutubePlaylistInput,
  slugifyLearningPathTitle,
  type ContentFactoryInputType,
  type ContentFactoryPhase,
} from "@/lib/content-factory/shared";
import { isMissingRelationError } from "@/lib/schema-guard";
import { FACTORY_RETRY_MAX_ATTEMPTS, isPermanentFactoryError, isRetryableFactoryError } from "@/lib/content-factory/ops-shared";

export async function createContentFactoryJob(
  admin: SupabaseClient<Database>,
  params: {
    adminId: string;
    inputType: ContentFactoryInputType;
    inputValue: string;
  },
) {
  let inputValue = params.inputValue.trim();
  if (params.inputType === "topic") {
    throw new Error(
      "Topic discovery creates a discovery run, not a generation job. Use inputType=topic on POST /api/admin/content-factory/jobs.",
    );
  }
  if (params.inputType === "playlist_url" || params.inputType === "playlist_id") {
    const parsed = parseYoutubePlaylistInput(inputValue);
    if ("error" in parsed) throw new Error(parsed.error);
    inputValue = parsed.playlistId;

    const { data: existingPath } = await admin
      .from("learning_paths")
      .select("id, status, slug")
      .eq("source_playlist_id", inputValue)
      .in("status", ["draft", "review", "published"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingPath) {
      throw new Error(
        `A learning path already exists for this playlist (${existingPath.status}: ${existingPath.slug}). Reject or archive it before re-importing.`,
      );
    }

    const { data: existingJob } = await admin
      .from("content_factory_jobs")
      .select("id, status")
      .eq("input_value", inputValue)
      .in("status", ["pending", "processing", "waiting_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingJob) {
      throw new Error(
        `A Content Factory job for this playlist is already ${existingJob.status} (${existingJob.id}).`,
      );
    }
  }
  const { data, error } = await admin
    .from("content_factory_jobs")
    .insert({
      admin_id: params.adminId,
      input_type: params.inputType === "playlist_url" ? "playlist_id" : params.inputType,
      input_value: inputValue,
      status: "pending",
      phase: "queued",
      progress: 0,
    })
    .select("*")
    .single();

  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new Error("Content Factory tables missing — apply migration 0042.");
    }
    throw new Error(error.message);
  }
  return data;
}

export async function listContentFactoryJobs(admin: SupabaseClient<Database>, limit = 40) {
  const { data, error } = await admin
    .from("content_factory_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getContentFactoryJob(admin: SupabaseClient<Database>, jobId: string) {
  const { data, error } = await admin
    .from("content_factory_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateJobProgress(
  admin: SupabaseClient<Database>,
  jobId: string,
  patch: {
    phase?: ContentFactoryPhase;
    progress?: number;
    status?: ContentFactoryJob["status"];
    learning_path_id?: string | null;
    error_message?: string | null;
    last_error?: string | null;
    result_snapshot?: Json;
    completed_at?: string | null;
  },
) {
  const { error } = await admin
    .from("content_factory_jobs")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);
  if (error) throw new Error(error.message);
}

export async function uniqueLearningPathSlug(
  admin: SupabaseClient<Database>,
  title: string,
): Promise<string> {
  const base = slugifyLearningPathTitle(title);
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await admin.from("learning_paths").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Re-queue a failed job that never produced a learning path. */
export async function retryFailedContentFactoryJob(
  admin: SupabaseClient<Database>,
  jobId: string,
) {
  const job = await getContentFactoryJob(admin, jobId);
  if (!job) throw new Error("Job not found.");
  if (job.status !== "failed") throw new Error("Only failed jobs can be retried.");
  if (job.learning_path_id) {
    throw new Error(
      "This failed job already has a draft learning path. Reject/archive that path and create a new job instead of retrying.",
    );
  }
  if (job.attempts >= FACTORY_RETRY_MAX_ATTEMPTS) {
    throw new Error("Retry maximum reached.");
  }
  const reason = job.error_message || job.last_error || "";
  if (isPermanentFactoryError(reason) || !isRetryableFactoryError(reason)) {
    throw new Error("This failure is not retryable.");
  }
  const { data, error } = await admin
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
    .eq("id", jobId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
