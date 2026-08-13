import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ContentFactoryCandidate, Database } from "@/types/database";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { isMissingRelationError } from "@/lib/schema-guard";
import { asStoredQualityReview } from "@/lib/content-factory/quality-shared";
import {
  blockContentFactorySource,
  isContentFactoryBlocked,
  type ContentFactoryBlockKind,
} from "@/lib/content-factory/blocks";
import {
  inspectPublishedPathSeo,
  matchesCandidateFilters,
  parseCandidateFilters,
  type CandidateFilterInput,
  type FactoryHealthCounts,
} from "@/lib/content-factory/ops-shared";

type Admin = SupabaseClient<Database>;

export async function listFilteredCandidates(
  admin: Admin,
  filters: CandidateFilterInput & { runId?: string | null; limit?: number },
) {
  let query = admin
    .from("content_factory_candidates")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 80);
  if (filters.runId) query = query.eq("run_id", filters.runId);
  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as ContentFactoryCandidate[]).filter((row) => matchesCandidateFilters(row, filters));
}

export async function rejectSelectedCandidates(admin: Admin, candidateIds: string[]) {
  if (!contentFactoryEnabled()) throw new Error("Content Factory is disabled.");
  const updated: string[] = [];
  for (const id of candidateIds.slice(0, 20)) {
    const { data, error } = await admin
      .from("content_factory_candidates")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["discovered", "qualified", "filtered"])
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) updated.push(data.id);
  }
  return { rejected: updated.length, ids: updated };
}

export async function blockSelectedCandidates(
  admin: Admin,
  params: { candidateIds: string[]; adminId: string; reason?: string },
) {
  if (!contentFactoryEnabled()) throw new Error("Content Factory is disabled.");
  const blocked: string[] = [];
  for (const id of params.candidateIds.slice(0, 20)) {
    const { data: candidate, error } = await admin
      .from("content_factory_candidates")
      .select("id, playlist_id, channel_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!candidate) continue;
    await blockContentFactorySource(admin, {
      kind: "playlist_id",
      value: candidate.playlist_id,
      reason: params.reason || "Blocked from Content Factory admin",
      createdBy: params.adminId,
    });
    await admin
      .from("content_factory_candidates")
      .update({ status: "blocked", updated_at: new Date().toISOString() })
      .eq("id", id);
    blocked.push(id);
  }
  return { blocked: blocked.length, ids: blocked };
}

export async function loadContentFactoryHealth(admin: Admin): Promise<FactoryHealthCounts> {
  const empty: FactoryHealthCounts = {
    jobs: { queued: 0, processing: 0, review: 0, published: 0, failed: 0 },
    discovery: { queued: 0, running: 0, completed: 0, failed: 0 },
    quality: { passed: 0, warning: 0, needs_revision: 0 },
    costs: {
      youtubeSearches24h: 0,
      qualifyCalls: 0,
      researchCalls: 0,
      qualityCalls: 0,
      generationJobs: 0,
      retryJobs: 0,
    },
    lastActivityAt: null,
  };
  try {
    const [
      pending,
      processing,
      waiting,
      failed,
      discQueued,
      discRunning,
      discCompleted,
      discFailed,
      published,
      jobs,
      paths,
      creators,
      candidates,
    ] = await Promise.all([
      countRows(admin, "content_factory_jobs", "status", "pending"),
      countRows(admin, "content_factory_jobs", "status", "processing"),
      countRows(admin, "content_factory_jobs", "status", "waiting_review"),
      countRows(admin, "content_factory_jobs", "status", "failed"),
      countRows(admin, "content_factory_discovery_runs", "status", "queued"),
      countRows(admin, "content_factory_discovery_runs", "status", "running"),
      countRows(admin, "content_factory_discovery_runs", "status", "completed"),
      countRows(admin, "content_factory_discovery_runs", "status", "failed"),
      countRows(admin, "learning_paths", "status", "published"),
      admin.from("content_factory_jobs").select("id, attempts, created_at, updated_at").order("updated_at", { ascending: false }).limit(80),
      admin.from("learning_paths").select("id, status, quality_breakdown, updated_at").order("updated_at", { ascending: false }).limit(80),
      admin.from("creator_profiles").select("id, research_status").limit(80),
      admin.from("content_factory_candidates").select("id, discovery_query, ai_score, created_at").limit(200),
    ]);

    const quality = { passed: 0, warning: 0, needs_revision: 0 };
    for (const path of paths.data ?? []) {
      const review = asStoredQualityReview(path.quality_breakdown);
      if (!review) continue;
      if (review.status === "passed") quality.passed += 1;
      else if (review.status === "warning") quality.warning += 1;
      else if (review.status === "needs_revision") quality.needs_revision += 1;
    }

    const since = Date.now() - 24 * 60 * 60 * 1000;
    const youtubeSearches24h = new Set(
      (candidates.data ?? [])
        .filter((row) => Date.parse(row.created_at) >= since)
        .map((row) => row.discovery_query),
    ).size;
    const qualifyCalls = (candidates.data ?? []).filter((row) => row.ai_score != null).length;
    const researchCalls = (creators.data ?? []).filter((row) => row.research_status === "complete" || row.research_status === "partial").length;
    const qualityCalls = quality.passed + quality.warning + quality.needs_revision;
    const generationJobs = jobs.data?.length ?? 0;
    const retryJobs = (jobs.data ?? []).filter((job) => (job.attempts ?? 0) > 1).length;
    const lastActivityAt =
      jobs.data?.[0]?.updated_at || paths.data?.[0]?.updated_at || null;

    return {
      jobs: {
        queued: pending,
        processing,
        review: waiting,
        published,
        failed,
      },
      discovery: {
        queued: discQueued,
        running: discRunning,
        completed: discCompleted,
        failed: discFailed,
      },
      quality,
      costs: {
        youtubeSearches24h,
        qualifyCalls,
        researchCalls,
        qualityCalls,
        generationJobs,
        retryJobs,
      },
      lastActivityAt,
    };
  } catch (err) {
    if (err instanceof Error && isMissingRelationError(err.message)) return empty;
    return empty;
  }
}

async function countRows(
  admin: Admin,
  table: "content_factory_jobs" | "content_factory_discovery_runs" | "learning_paths",
  column: string,
  value: string,
) {
  const { count, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, value);
  if (error) {
    if (isMissingRelationError(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function inspectRecentPublishedSeo(admin: Admin) {
  const { data: paths, error } = await admin
    .from("learning_paths")
    .select("id, title, slug, short_description, seo_title, seo_description, creator_profile_id, source_playlist_id")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(12);
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  const issues: Array<{ slug: string; field: string; message: string }> = [];
  for (const path of paths ?? []) {
    const [{ count: lessonCount }, { data: sources }, { data: creator }] = await Promise.all([
      admin.from("learning_path_lessons").select("id", { count: "exact", head: true }).eq("learning_path_id", path.id),
      admin.from("learning_path_sources").select("source_type").eq("learning_path_id", path.id),
      path.creator_profile_id
        ? admin.from("creator_profiles").select("display_name").eq("id", path.creator_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const found = inspectPublishedPathSeo({
      title: path.title,
      slug: path.slug,
      shortDescription: path.short_description,
      seoTitle: path.seo_title,
      seoDescription: path.seo_description,
      creatorName: creator?.display_name ?? null,
      lessonCount: lessonCount ?? 0,
      hasPlaylistSource: Boolean(path.source_playlist_id) || (sources ?? []).some((row) => row.source_type === "youtube_playlist"),
      hasCanonicalHint: Boolean(path.slug),
    });
    for (const issue of found) issues.push({ slug: path.slug, ...issue });
  }
  return issues;
}

export { parseCandidateFilters, isContentFactoryBlocked };
export type { ContentFactoryBlockKind };
