import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { isContentFactoryBlocked } from "@/lib/content-factory/blocks";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  DISCOVERY_SEARCH_PAGE_SIZE,
  DISCOVERY_TOPIC_COOLDOWN_HOURS,
  normalizeDiscoveryTopic,
  scoreDiscoveryCandidate,
  validateDiscoveryInput,
} from "@/lib/content-factory/discovery-shared";
import { decideCandidateQuality } from "@/lib/content-factory/library-build/quality-decision-shared";
import {
  markLibraryJobRunningForRun,
  syncLibraryBuildDiscoveryJobs,
} from "@/lib/content-factory/library-build/discovery-sync";
import {
  buildDiscoverySearchQueries,
  parseDiscoveryTopics,
  searchMaxPerDay,
  searchMaxPerRun,
  similarTitleWarning,
} from "@/lib/content-factory/ops-shared";
import {
  fetchChannelsDiscoverySnippets,
  fetchPlaylistsDiscoveryMeta,
  searchYouTubePlaylists,
} from "@/lib/youtube";

export {
  DISCOVERY_SEARCH_MAX_PER_DAY,
  DISCOVERY_TARGET_DEFAULT,
  DISCOVERY_TARGET_MAX,
  DISCOVERY_TOPIC_COOLDOWN_HOURS,
  DISCOVERY_TOPIC_MAX_LEN,
  buildDiscoverySearchQuery,
  validateDiscoveryInput,
} from "@/lib/content-factory/discovery-shared";
export { parseDiscoveryTopics, buildDiscoverySearchQueries } from "@/lib/content-factory/ops-shared";

function discoveryTablesMissing(message: string) {
  return isMissingRelationError(message);
}

function searchCap(): number {
  return searchMaxPerDay(process.env.CONTENT_FACTORY_SEARCH_MAX_PER_DAY);
}

function searchRunCap(): number {
  return searchMaxPerRun(process.env.CONTENT_FACTORY_SEARCH_MAX_PER_RUN);
}

function cooldownHours(): number {
  const raw = Number(process.env.CONTENT_FACTORY_TOPIC_COOLDOWN_HOURS);
  if (Number.isFinite(raw) && raw >= 0) return raw;
  return DISCOVERY_TOPIC_COOLDOWN_HOURS;
}

export function isYoutubeQuotaError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("quotaexceeded") ||
    lower.includes("quota exceeded") ||
    (lower.includes("quota") && lower.includes("exceed"))
  );
}

/** Approximate YouTube search.list units used in the last 24h. */
export async function countRecentDiscoverySearches(
  admin: SupabaseClient<Database>,
  excludeId?: string,
  opts?: { includeQueued?: boolean },
): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: runs, error } = await admin
    .from("content_factory_discovery_runs")
    .select("id, status")
    .in("status", ["queued", "running", "completed", "failed"])
    .gte("created_at", since);
  if (error) {
    if (discoveryTablesMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  const active = (runs ?? []).filter((row) => row.id !== excludeId);
  const queued = opts?.includeQueued === false ? 0 : active.filter((row) => row.status === "queued").length;
  const processedIds = active.filter((row) => row.status !== "queued").map((row) => row.id);
  if (!processedIds.length) return queued;
  const { data: candidates, error: candError } = await admin
    .from("content_factory_candidates")
    .select("run_id, discovery_query")
    .in("run_id", processedIds);
  if (candError) {
    if (discoveryTablesMissing(candError.message)) return queued;
    throw new Error(candError.message);
  }
  const units = new Set((candidates ?? []).map((row) => `${row.run_id}::${row.discovery_query}`));
  const searchedRuns = new Set((candidates ?? []).map((row) => row.run_id));
  const emptyProcessed = processedIds.filter((id) => !searchedRuns.has(id)).length;
  return units.size + queued + emptyProcessed;
}

export async function findTopicCooldownRun(
  admin: SupabaseClient<Database>,
  topic: string,
) {
  const hours = cooldownHours();
  if (hours <= 0) return null;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("content_factory_discovery_runs")
    .select("id, topic, status, target_generate, created_at")
    .in("status", ["queued", "running", "completed"])
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) {
    if (discoveryTablesMissing(error.message)) return null;
    throw new Error(error.message);
  }
  const needle = normalizeDiscoveryTopic(topic).toLowerCase();
  return (data ?? []).find((row) => normalizeDiscoveryTopic(row.topic).toLowerCase() === needle) ?? null;
}

export async function createDiscoveryRun(
  admin: SupabaseClient<Database>,
  params: { adminId: string; topic: string; targetGenerate?: number },
): Promise<{
  id: string;
  status: string;
  topic: string;
  target_generate: number;
  reused?: boolean;
}> {
  if (!contentFactoryEnabled()) {
    throw new Error("Content Factory is disabled.");
  }
  const validated = validateDiscoveryInput({
    topic: params.topic,
    targetGenerate: params.targetGenerate,
  });
  if ("error" in validated) throw new Error(validated.error);

  // Reuse today's search instead of hard-failing — show results and keep generating.
  const cooldown = await findTopicCooldownRun(admin, validated.topic);
  if (cooldown) {
    return {
      id: cooldown.id,
      status: cooldown.status,
      topic: cooldown.topic,
      target_generate: Number(cooldown.target_generate ?? validated.targetGenerate),
      reused: true,
    };
  }

  const used = await countRecentDiscoverySearches(admin, undefined, { includeQueued: true });
  const cap = searchCap();
  if (used >= cap) {
    throw new Error(
      `Daily YouTube search cap reached (${cap} per day). Discovery will not run.`,
    );
  }

  const { data, error } = await admin
    .from("content_factory_discovery_runs")
    .insert({
      admin_id: params.adminId,
      topic: validated.topic,
      target_generate: validated.targetGenerate,
      status: "queued",
    })
    .select("id, status, topic, target_generate")
    .single();
  if (error) {
    if (discoveryTablesMissing(error.message)) {
      throw new Error("Content Factory discovery tables missing — apply migration 0043.");
    }
    throw new Error(error.message);
  }
  return data;
}

export async function createDiscoveryRuns(
  admin: SupabaseClient<Database>,
  params: { adminId: string; topics: string; targetGenerate?: number },
) {
  const topics = parseDiscoveryTopics(params.topics);
  if (!topics.length) throw new Error("Topic is required.");
  const created: Array<{ id: string; status: string; topic: string; target_generate: number }> = [];
  const skipped: Array<{ topic: string; error: string }> = [];
  for (const topic of topics) {
    try {
      const run = await createDiscoveryRun(admin, {
        adminId: params.adminId,
        topic,
        targetGenerate: params.targetGenerate,
      });
      created.push(run);
    } catch (err) {
      skipped.push({ topic, error: err instanceof Error ? err.message : "Discovery failed." });
    }
  }
  if (!created.length) {
    throw new Error(skipped[0]?.error || "No discovery runs were created.");
  }
  return { created, skipped };
}

export async function listDiscoveryRuns(admin: SupabaseClient<Database>, limit = 20) {
  const { data, error } = await admin
    .from("content_factory_discovery_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (discoveryTablesMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function playlistAlreadyImported(
  admin: SupabaseClient<Database>,
  playlistId: string,
): Promise<boolean> {
  const { data: path } = await admin
    .from("learning_paths")
    .select("id")
    .eq("source_playlist_id", playlistId)
    .maybeSingle();
  if (path) return true;
  const { data: job } = await admin
    .from("content_factory_jobs")
    .select("id")
    .eq("input_value", playlistId)
    .maybeSingle();
  return Boolean(job);
}

async function candidateExists(
  admin: SupabaseClient<Database>,
  playlistId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("content_factory_candidates")
    .select("id")
    .eq("playlist_id", playlistId)
    .maybeSingle();
  if (error) {
    if (discoveryTablesMissing(error.message)) return false;
    throw new Error(error.message);
  }
  return Boolean(data);
}

export async function processQueuedDiscoveryRun(admin: SupabaseClient<Database>) {
  if (!contentFactoryEnabled()) return { processed: false as const, reason: "disabled" as const };

  const { data: run, error } = await admin
    .from("content_factory_discovery_runs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (discoveryTablesMissing(error.message)) return { processed: false as const, reason: "missing_tables" as const };
    throw new Error(error.message);
  }
  if (!run) return { processed: false as const, reason: "idle" as const };

  const used = await countRecentDiscoverySearches(admin, run.id, { includeQueued: false });
  const cap = searchCap();
  if (used >= cap) {
    await admin
      .from("content_factory_discovery_runs")
      .update({
        status: "failed",
        error_message: `Daily YouTube search cap reached (${cap} per day). Discovery will not run.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { processed: true as const, runId: run.id, status: "failed" as const, reason: "search_cap" as const };
  }

  await admin
    .from("content_factory_discovery_runs")
    .update({ status: "running", error_message: null })
    .eq("id", run.id);
  await markLibraryJobRunningForRun(admin, run.id);

  const remaining = Math.max(0, cap - used);
  const queries = buildDiscoverySearchQueries(run.topic, Math.min(searchRunCap(), remaining || 0));
  if (!queries.length) {
    await admin
      .from("content_factory_discovery_runs")
      .update({
        status: "failed",
        error_message: `Daily YouTube search cap reached (${cap} per day). Discovery will not run.`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    return { processed: true as const, runId: run.id, status: "failed" as const, reason: "search_cap" as const };
  }

  try {
    const hitsById = new Map<string, Awaited<ReturnType<typeof searchYouTubePlaylists>>[number] & { query: string }>();
    for (const query of queries) {
      const hits = await searchYouTubePlaylists(query, DISCOVERY_SEARCH_PAGE_SIZE);
      for (const hit of hits) {
        if (!hitsById.has(hit.playlistId)) {
          hitsById.set(hit.playlistId, { ...hit, query });
        }
      }
    }
    const hits = [...hitsById.values()];
    const playlistIds = hits.map((h) => h.playlistId);
    const playlistMeta = await fetchPlaylistsDiscoveryMeta(playlistIds);
    const channelIds = [...playlistMeta.values()]
      .map((p) => p.channelId)
      .filter((id): id is string => Boolean(id));
    const channelSnippets = await fetchChannelsDiscoverySnippets(channelIds);
    const { data: existingCandidates } = await admin
      .from("content_factory_candidates")
      .select("playlist_id, channel_id, title")
      .limit(400);

    let discoveredCount = 0;
    let filteredCount = 0;

    for (const hit of hits) {
      const meta = playlistMeta.get(hit.playlistId);
      const title = meta?.title || hit.title;
      const description = meta?.description || hit.description;
      const channelId = meta?.channelId || hit.channelId || "";
      const channelTitle = meta?.channelTitle || hit.channelTitle || "";
      const thumbnailUrl = meta?.thumbnailUrl || hit.thumbnailUrl;
      const itemCount = meta?.itemCount ?? null;

      if (await isContentFactoryBlocked(admin, "playlist_id", hit.playlistId)) continue;
      if (channelId && (await isContentFactoryBlocked(admin, "channel_id", channelId))) continue;
      if (await playlistAlreadyImported(admin, hit.playlistId)) continue;
      if (await candidateExists(admin, hit.playlistId)) continue;

      const channelSeen = Boolean(
        channelId && (existingCandidates ?? []).some((row) => row.channel_id === channelId && row.playlist_id !== hit.playlistId),
      );
      const titleWarning = (existingCandidates ?? []).some((row) =>
        similarTitleWarning({
          title,
          otherTitle: row.title,
          channelId,
          otherChannelId: row.channel_id,
        }),
      );

      const scored = scoreDiscoveryCandidate({
        topic: run.topic,
        title,
        description,
        channelTitle,
        itemCount,
        channelDescription: channelId ? channelSnippets.get(channelId)?.description : null,
        isDuplicate: false,
      });

      const status = scored.filterReason ? "filtered" : "discovered";
      if (status === "filtered") filteredCount += 1;
      else discoveredCount += 1;

      const quality = decideCandidateQuality({
        candidateStatus: status,
        ruleScore: scored.ruleScore,
        aiScore: null,
        filterReason: scored.filterReason,
        scoreBreakdown: {
          ...scored.breakdown,
          titleSimilarityWarning: titleWarning,
          channelSeen,
        },
      });

      const { error: insertError } = await admin.from("content_factory_candidates").insert({
        run_id: run.id,
        playlist_id: hit.playlistId,
        channel_id: channelId,
        title,
        channel_title: channelTitle,
        item_count: itemCount,
        thumbnail_url: thumbnailUrl,
        topic: run.topic,
        discovery_query: hit.query,
        status,
        rule_score: scored.ruleScore,
        ai_score: null,
        score_breakdown: {
          ...scored.breakdown,
          playlistDescription: description.slice(0, 400),
          titleSimilarityWarning: titleWarning,
          channelSeen,
        } as unknown as Json,
        filter_reason: scored.filterReason,
        library_topic_id: run.library_topic_id ?? null,
        quality_status: quality.qualityStatus,
        quality_reason: quality.qualityReason,
        rejection_reason: quality.rejectionReason,
        final_quality_score: quality.finalQualityScore,
      });
      if (insertError) {
        if (insertError.message.toLowerCase().includes("duplicate") || insertError.code === "23505") {
          continue;
        }
        throw new Error(insertError.message);
      }
    }

    const nextStatus = discoveredCount > 0 ? "running" : "completed";
    await admin
      .from("content_factory_discovery_runs")
      .update({
        status: nextStatus,
        discovered_count: discoveredCount,
        filtered_count: filteredCount,
        qualified_count: 0,
        generated_count: 0,
        failed_count: 0,
        error_message: null,
        completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", run.id);

    try {
      await syncLibraryBuildDiscoveryJobs(admin, { runId: run.id });
    } catch {
      /* library build optional */
    }

    return {
      processed: true as const,
      runId: run.id,
      status: nextStatus,
      discoveredCount,
      filteredCount,
      needsQualification: discoveredCount > 0,
      generated: false as const,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Discovery failed.";
    const quota = isYoutubeQuotaError(message);
    await admin
      .from("content_factory_discovery_runs")
      .update({
        status: "failed",
        error_message: quota
          ? "YouTube quota exceeded. Discovery stopped without retrying."
          : message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", run.id);
    try {
      await syncLibraryBuildDiscoveryJobs(admin, { runId: run.id });
    } catch {
      /* library build optional */
    }
    return {
      processed: true as const,
      runId: run.id,
      status: "failed" as const,
      quotaExceeded: quota,
    };
  }
}
