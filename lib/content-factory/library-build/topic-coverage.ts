import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  computeTopicCoverageStatusFromCounts,
  coveragePercentage,
  countsTowardTopicCoverage,
  perTopicTargetCoverage,
  type TopicCoverageStatus,
} from "@/lib/content-factory/library-build/coverage-shared";

type Admin = SupabaseClient<Database>;

function tablesMissing(message: string) {
  return isMissingRelationError(message);
}

export async function assignCandidateLibraryTopic(
  admin: Admin,
  candidateId: string,
  topicId: string | null,
) {
  if (!topicId) return;
  try {
    await admin
      .from("content_factory_candidates")
      .update({ library_topic_id: topicId, updated_at: new Date().toISOString() })
      .eq("id", candidateId);
  } catch {
    /* columns optional until migration */
  }
}

export async function linkPublishedPathToTopic(
  admin: Admin,
  pathId: string,
  topicId: string,
): Promise<void> {
  try {
    await admin.from("library_build_topic_courses").upsert(
      {
        learning_path_id: pathId,
        topic_id: topicId,
        is_primary: true,
      },
      { onConflict: "learning_path_id,topic_id" },
    );
    await admin
      .from("learning_paths")
      .update({
        library_build_topic_id: topicId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", pathId);
  } catch (err) {
    if (tablesMissing(err instanceof Error ? err.message : String(err))) return;
    throw err;
  }
}

export async function resolveTopicIdForCandidate(
  admin: Admin,
  candidate: { run_id: string; library_topic_id?: string | null },
): Promise<string | null> {
  if (candidate.library_topic_id) return candidate.library_topic_id;
  const { data: run } = await admin
    .from("content_factory_discovery_runs")
    .select("library_topic_id")
    .eq("id", candidate.run_id)
    .maybeSingle();
  return run?.library_topic_id ?? null;
}

export async function refreshTopicCoverageCounts(admin: Admin): Promise<number> {
  const { data: topics, error } = await admin
    .from("library_build_topics")
    .select(
      "id, target_coverage, category_id, library_build_categories(preferred_target, minimum_coverage_goal)",
    );
  if (error) {
    if (tablesMissing(error.message)) return 0;
    throw new Error(error.message);
  }

  const topicsByCategory = new Map<string, number>();
  for (const t of topics ?? []) topicsByCategory.set(t.category_id, (topicsByCategory.get(t.category_id) ?? 0) + 1);

  let updated = 0;
  for (const topic of topics ?? []) {
    const cat = (topic as {
      library_build_categories?: { preferred_target?: number; minimum_coverage_goal?: number };
    }).library_build_categories;
    const topicsInCat = topicsByCategory.get(topic.category_id) ?? 1;
    const target =
      topic.target_coverage > 0
        ? topic.target_coverage
        : perTopicTargetCoverage(cat?.preferred_target ?? 30, topicsInCat, cat?.minimum_coverage_goal);

    const { data: links } = await admin
      .from("library_build_topic_courses")
      .select("learning_path_id, learning_paths(status)")
      .eq("topic_id", topic.id)
      .eq("is_primary", true);

    let publishedCount = 0;
    let approvedCount = 0;
    let lastPublishedAt: string | null = null;

    for (const link of links ?? []) {
      const status = (link as { learning_paths?: { status?: string } }).learning_paths?.status;
      if (countsTowardTopicCoverage(status)) {
        publishedCount += 1;
        approvedCount += 1;
      }
    }

    if (publishedCount) {
      const { data: recent } = await admin
        .from("learning_paths")
        .select("published_at")
        .eq("library_build_topic_id", topic.id)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastPublishedAt = recent?.published_at ?? null;
    }

    const coverageStatus: TopicCoverageStatus = computeTopicCoverageStatusFromCounts({
      publishedCount,
      targetCoverage: target,
    });

    await admin
      .from("library_build_topics")
      .update({
        published_course_count: publishedCount,
        approved_course_count: approvedCount,
        target_coverage: target,
        coverage_status: coverageStatus,
        last_published_at: lastPublishedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", topic.id);
    updated += 1;
  }

  return updated;
}

export { computeTopicCoverageStatusFromCounts, coveragePercentage, countsTowardTopicCoverage };
