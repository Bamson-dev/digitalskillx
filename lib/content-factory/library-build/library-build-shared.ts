/** Pure Library Build Engine helpers (no secrets, no I/O). */

import { titleSimilarity } from "@/lib/content-factory/ops-shared";
import {
  computeTopicCoverageStatusFromCounts,
  coveragePercentage,
} from "@/lib/content-factory/library-build/coverage-shared";
import {
  LEARN_CERTIFICATE_PRICE_TIERS,
  LEARN_CERTIFICATE_USD_BY_NGN,
  resolveFinalCertificatePrice,
  type LearnCertificatePriceTier,
} from "@/lib/learn-certificate-pricing";

export const LIBRARY_BUILD_DEFAULT_TARGET = 300;
export const LIBRARY_BUILD_DEFAULT_DISCOVERY_JOBS_PER_DAY = 48;
export const LIBRARY_BUILD_DEFAULT_MAINTENANCE_MAX = 20;
export const LIBRARY_BUILD_DEFAULT_QUALITY_THRESHOLD = 60;
export const LIBRARY_BUILD_DEFAULT_DISCOVERY_BACKLOG_TARGET = 12;
export const LIBRARY_BUILD_DEFAULT_MAX_CONCURRENT_DISCOVERY_JOBS = 8;
export const LIBRARY_BUILD_DEFAULT_QUALIFICATION_BATCH_SIZE = 8;
export const LIBRARY_BUILD_DEFAULT_GENERATION_BATCH_SIZE = 40;
export const LIBRARY_BUILD_DEFAULT_PUBLICATION_BATCH_SIZE = 12;
export const LIBRARY_BUILD_DEFAULT_EXPANSION_MAX_PER_DAY = 0;
export const LIBRARY_BUILD_DEFAULT_STALL_RECOVERY_MINUTES = 20;
export const LIBRARY_BUILD_MAX_RETRIES = 3;
export const LIBRARY_BUILD_STALE_JOB_MS = 30 * 60 * 1000;
export const LIBRARY_BUILD_OVERSHOOT_DEFAULT = 0;

export type LibraryBuildMode = "bulk" | "maintenance" | "expansion" | "continuous" | "paused" | "stopped";
export type LibraryRunStatus = "idle" | "running" | "paused" | "stopped" | "completed";
export type LibraryBuildPhase = "build" | "continuous_expansion" | "maintenance" | "paused" | "stopped" | "idle";
export type TopicCoverageStatus =
  | "unknown"
  | "high_priority"
  | "needs_content"
  | "developing"
  | "good"
  | "strong";

export type TopicCoverageRow = {
  id: string;
  name: string;
  categoryName: string;
  categorySlug: string;
  approvedCourseCount: number;
  publishedCourseCount: number;
  targetCoverage: number;
  coveragePercentage: number;
  priorityWeight: number;
  active: boolean;
  coverageStatus: TopicCoverageStatus;
  minimumCategoryGoal?: number;
  preferredCategoryTarget?: number;
  categoryPriorityWeight?: number;
};

export type LibraryBuildSettingsSnapshot = {
  targetPublishedCount: number;
  buildMode: LibraryBuildMode;
  runStatus: LibraryRunStatus;
  qualityThreshold: number;
  discoveryJobsPerDay: number;
  maintenanceMaxPerWeek: number;
  continuousExpansionEnabled: boolean;
  discoveryBacklogTarget: number;
  maxConcurrentDiscoveryJobs: number;
  qualificationBatchSize: number;
  generationBatchSize: number;
  publicationBatchSize: number;
  expansionMaxPerDay: number;
  stallRecoveryMinutes: number;
};

export { coveragePercentage };

export type QualityDimensionScores = {
  relevance: number;
  completeness: number;
  structure: number;
  educationalClarity: number;
  topicFit: number;
  sourceQuality: number;
  freshness: number;
  duplicateRisk: number;
  promotionalNoise: number;
  clickbaitRisk: number;
};

export type PublishVerificationInput = {
  path: {
    id: string;
    title: string | null;
    short_description: string | null;
    description?: string | null;
    category: string | null;
    difficulty: string | null;
    learning_objectives?: string[] | null;
    source_playlist_id?: string | null;
    status?: string | null;
    quality_score?: number | null;
    estimated_duration_seconds?: number | null;
    artwork_public_url?: string | null;
    artwork_storage_path?: string | null;
    artwork_status?: string | null;
    certificate_enabled?: boolean | null;
    certificate_pricing_mode?: string | null;
    certificate_price_ngn?: number | null;
    certificate_recommended_price_ngn?: number | null;
  };
  lessons: Array<{ id: string; title: string; youtube_video_id: string | null; position: number }>;
  existingPublishedTitles?: string[];
  minQualityScore?: number;
};

export type PublishVerificationResult = {
  ok: boolean;
  failedChecks: string[];
  reasons: string[];
};

export type DedupeCandidateInput = {
  playlistId?: string | null;
  videoId?: string | null;
  sourceUrl?: string | null;
  title: string;
  channelId?: string | null;
  existingPlaylistIds?: Set<string>;
  existingVideoIds?: Set<string>;
  existingSourceUrls?: Set<string>;
  existingTitles?: Array<{ title: string; channelId?: string | null }>;
  queuedPlaylistIds?: Set<string>;
  processingPlaylistIds?: Set<string>;
};

export function countTowardLibraryTarget(status: string | null | undefined): boolean {
  return status === "published";
}

export function remainingToTarget(publishedCount: number, target: number): number {
  return Math.max(0, target - Math.max(0, publishedCount));
}

export function hasReachedMinimumLibrarySize(
  publishedCount: number,
  minimumSize: number,
  overshoot = LIBRARY_BUILD_OVERSHOOT_DEFAULT,
): boolean {
  return publishedCount >= minimumSize + Math.max(0, overshoot);
}

/** @deprecated Use hasReachedMinimumLibrarySize — target is a minimum, not a stop signal. */
export function shouldStopBulkAtTarget(
  publishedCount: number,
  target: number,
  overshoot = LIBRARY_BUILD_OVERSHOOT_DEFAULT,
): boolean {
  return hasReachedMinimumLibrarySize(publishedCount, target, overshoot);
}

export function resolveLibraryBuildPhase(input: {
  runStatus: LibraryRunStatus;
  buildMode: LibraryBuildMode;
  publishedCount: number;
  minimumLibrarySize: number;
  continuousExpansionEnabled?: boolean;
}): LibraryBuildPhase {
  if (input.runStatus === "paused" || input.buildMode === "paused") return "paused";
  if (input.runStatus === "stopped" || input.buildMode === "stopped") return "stopped";
  if (input.runStatus !== "running") return "idle";
  if (
    hasReachedMinimumLibrarySize(input.publishedCount, input.minimumLibrarySize) &&
    (input.continuousExpansionEnabled ?? true)
  ) {
    return "continuous_expansion";
  }
  if (input.buildMode === "maintenance") return "maintenance";
  return "build";
}

export function resolveEffectiveBuildMode(input: {
  settingsMode: LibraryBuildMode;
  runStatus: LibraryRunStatus;
  publishedCount: number;
  target: number;
  continuousExpansionEnabled?: boolean;
}): LibraryBuildMode {
  if (input.runStatus === "paused") return "paused";
  if (input.runStatus === "stopped") return "stopped";
  const continuous = input.continuousExpansionEnabled ?? true;
  if (input.publishedCount < input.target) {
    if (input.settingsMode === "expansion" || input.settingsMode === "bulk") return input.settingsMode;
    if (input.runStatus === "running") return "bulk";
  }
  if (hasReachedMinimumLibrarySize(input.publishedCount, input.target)) {
    if (continuous && input.runStatus === "running") return "continuous";
    if (input.settingsMode === "continuous") return "continuous";
    return "maintenance";
  }
  return input.settingsMode;
}

export function shouldContinueAutomatedDiscovery(input: {
  runStatus: LibraryRunStatus;
  buildMode: LibraryBuildMode;
  publishedCount: number;
  target: number;
  continuousExpansionEnabled?: boolean;
  publishedToday?: number;
  expansionMaxPerDay?: number;
  maintenanceApprovedThisWeek?: number;
  maintenanceMaxPerWeek?: number;
}): boolean {
  if (input.runStatus !== "running") return false;
  if (input.buildMode === "paused" || input.buildMode === "stopped") return false;
  if (input.buildMode === "bulk" || input.buildMode === "expansion") return true;
  if (input.buildMode === "continuous") {
    return input.continuousExpansionEnabled !== false;
  }
  if (input.buildMode === "maintenance") {
    const max = input.maintenanceMaxPerWeek ?? LIBRARY_BUILD_DEFAULT_MAINTENANCE_MAX;
    const used = input.maintenanceApprovedThisWeek ?? 0;
    return used < max;
  }
  return false;
}

export function discoveryJobsToCreate(input: {
  openJobs: number;
  backlogTarget: number;
  maxConcurrent: number;
  jobsToday: number;
  dailyLimit: number;
}): number {
  const headroom = Math.max(input.backlogTarget, input.maxConcurrent);
  const slots = Math.max(0, headroom - input.openJobs);
  if (slots <= 0) return 0;
  const dailyRemaining = Math.max(0, Math.max(1, input.dailyLimit) - input.jobsToday);
  return Math.min(slots, dailyRemaining);
}

export function isEngineStalled(input: {
  runStatus: LibraryRunStatus;
  publishedCount: number;
  minimumLibrarySize: number;
  lastSuccessfulActivityAt: string | null | undefined;
  stallRecoveryMinutes?: number;
  activeJobs: number;
  pendingCandidates: number;
  pipelineQueued: number;
  nowMs?: number;
}): boolean {
  if (input.runStatus !== "running") return false;
  if (input.activeJobs > 0 || input.pendingCandidates > 0 || input.pipelineQueued > 0) return false;
  const minutes = input.stallRecoveryMinutes ?? LIBRARY_BUILD_DEFAULT_STALL_RECOVERY_MINUTES;
  if (!input.lastSuccessfulActivityAt) return true;
  const last = Date.parse(input.lastSuccessfulActivityAt);
  if (!Number.isFinite(last)) return true;
  const now = input.nowMs ?? Date.now();
  return now - last >= minutes * 60 * 1000;
}

export function computeTopicCoverageStatus(
  publishedCount: number,
  targetCoverage = 5,
): TopicCoverageStatus {
  return computeTopicCoverageStatusFromCounts({ publishedCount, targetCoverage });
}

export function topicDiscoveryPriorityScore(row: TopicCoverageRow, remainingToLibraryTarget: number): number {
  let score = row.priorityWeight;
  if (row.coverageStatus === "high_priority") score += 40;
  else if (row.coverageStatus === "needs_content") score += 30;
  else if (row.coverageStatus === "developing") score += 18;
  else if (row.coverageStatus === "good") score += 8;
  else if (row.coverageStatus === "strong") score += 2;
  score += Math.max(0, 24 - row.publishedCourseCount * 4);
  score += Math.floor((row.categoryPriorityWeight ?? 50) / 5);
  if (remainingToLibraryTarget > 0) score += Math.min(15, Math.floor(remainingToLibraryTarget / 20));
  if (!row.active) score = -1000;
  return score;
}

export function pickNextTopic(
  rows: TopicCoverageRow[],
  remainingToLibraryTarget: number,
): TopicCoverageRow | null {
  return pickNextTopics(rows, remainingToLibraryTarget, 1)[0] ?? null;
}

export function pickNextTopics(
  rows: TopicCoverageRow[],
  remainingToLibraryTarget: number,
  count = 1,
  excludeTopicIds: ReadonlySet<string> = new Set(),
): TopicCoverageRow[] {
  const active = rows.filter((row) => row.active && !excludeTopicIds.has(row.id));
  if (!active.length || count <= 0) return [];

  const score = (row: TopicCoverageRow) => topicDiscoveryPriorityScore(row, remainingToLibraryTarget);
  const byCategory = new Map<string, TopicCoverageRow[]>();
  for (const row of active) {
    const key = row.categorySlug || row.categoryName;
    const list = byCategory.get(key) ?? [];
    list.push(row);
    byCategory.set(key, list);
  }
  for (const list of byCategory.values()) {
    list.sort(
      (a, b) =>
        score(b) - score(a) ||
        a.approvedCourseCount - b.approvedCourseCount ||
        a.publishedCourseCount - b.publishedCourseCount ||
        a.name.localeCompare(b.name),
    );
  }

  const picked: TopicCoverageRow[] = [];
  const used = new Set<string>();
  const categories = [...byCategory.keys()].sort();
  while (picked.length < count) {
    let added = false;
    for (const category of categories) {
      if (picked.length >= count) break;
      const next = byCategory.get(category)?.find((row) => !used.has(row.id));
      if (!next) continue;
      picked.push(next);
      used.add(next.id);
      added = true;
    }
    if (!added) break;
  }

  if (picked.length < count) {
    const sorted = [...active]
      .filter((row) => !used.has(row.id))
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          a.approvedCourseCount - b.approvedCourseCount ||
          a.publishedCourseCount - b.publishedCourseCount ||
          a.name.localeCompare(b.name),
      );
    for (const row of sorted) {
      if (picked.length >= count) break;
      picked.push(row);
    }
  }

  return picked;
}

export function discoveryQueriesForTopic(
  topicName: string,
  storedQueries: string[] | null | undefined,
  max = 5,
): string[] {
  const fromDb = (storedQueries ?? [])
    .map((q) => q.trim())
    .filter(Boolean)
    .slice(0, max);
  if (fromDb.length) return fromDb;
  const base = topicName.trim();
  if (!base) return [];
  const templates = [
    `${base} full course beginners`,
    `${base} complete tutorial`,
    `Learn ${base} from scratch`,
    `${base} programming full course`,
    `${base} projects for beginners`,
  ];
  return templates.slice(0, max);
}

export function compositeQualityScore(dimensions: Partial<QualityDimensionScores>): {
  score: number;
  status: "approved" | "rejected" | "pending";
  reason: string;
} {
  const d: QualityDimensionScores = {
    relevance: dimensions.relevance ?? 0,
    completeness: dimensions.completeness ?? 0,
    structure: dimensions.structure ?? 0,
    educationalClarity: dimensions.educationalClarity ?? 0,
    topicFit: dimensions.topicFit ?? 0,
    sourceQuality: dimensions.sourceQuality ?? 0,
    freshness: dimensions.freshness ?? 0,
    duplicateRisk: dimensions.duplicateRisk ?? 0,
    promotionalNoise: dimensions.promotionalNoise ?? 0,
    clickbaitRisk: dimensions.clickbaitRisk ?? 0,
  };
  const weights = {
    relevance: 1.2,
    completeness: 1.1,
    structure: 1,
    educationalClarity: 1,
    topicFit: 1.1,
    sourceQuality: 0.9,
    freshness: 0.5,
    duplicateRisk: 1.3,
    promotionalNoise: 1.2,
    clickbaitRisk: 1.1,
  };
  let weighted = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const value = d[key as keyof QualityDimensionScores];
    weighted += value * weight;
    totalWeight += weight * 10;
  }
  const score = Math.round((weighted / totalWeight) * 100);
  if (d.duplicateRisk >= 8) {
    return { score, status: "rejected", reason: "Duplicate source" };
  }
  if (d.promotionalNoise >= 8) {
    return { score, status: "rejected", reason: "Too promotional" };
  }
  if (d.structure <= 2 || d.completeness <= 2) {
    return { score, status: "rejected", reason: "Insufficient educational structure" };
  }
  if (d.topicFit <= 2) {
    return { score, status: "rejected", reason: "Weak topic fit" };
  }
  return { score, status: "pending", reason: "Awaiting threshold check" };
}

export function applyQualityThreshold(
  score: number,
  threshold: number,
  pendingReason: string,
): { qualityStatus: "approved" | "rejected"; qualityReason: string; rejectionReason?: string } {
  if (score >= threshold) {
    return { qualityStatus: "approved", qualityReason: `Quality score ${score} meets threshold ${threshold}.` };
  }
  return {
    qualityStatus: "rejected",
    qualityReason: pendingReason,
    rejectionReason: `Quality score ${score} below threshold ${threshold}.`,
  };
}

export function dedupeCandidate(input: DedupeCandidateInput): { duplicate: boolean; reason: string | null } {
  const playlistId = input.playlistId?.trim();
  if (playlistId && input.existingPlaylistIds?.has(playlistId)) {
    return { duplicate: true, reason: "Exact playlist ID already exists" };
  }
  if (playlistId && input.queuedPlaylistIds?.has(playlistId)) {
    return { duplicate: true, reason: "Playlist already queued" };
  }
  if (playlistId && input.processingPlaylistIds?.has(playlistId)) {
    return { duplicate: true, reason: "Playlist currently processing" };
  }
  const videoId = input.videoId?.trim();
  if (videoId && input.existingVideoIds?.has(videoId)) {
    return { duplicate: true, reason: "Exact YouTube video ID already exists" };
  }
  const sourceUrl = input.sourceUrl?.trim().toLowerCase();
  if (sourceUrl && input.existingSourceUrls?.has(sourceUrl)) {
    return { duplicate: true, reason: "Existing source URL" };
  }
  for (const other of input.existingTitles ?? []) {
    const sim = titleSimilarity(input.title, other.title);
    if (sim >= 0.92) return { duplicate: true, reason: "Normalized title similarity" };
    if (
      input.channelId &&
      other.channelId &&
      input.channelId === other.channelId &&
      sim >= 0.85
    ) {
      return { duplicate: true, reason: "Channel + highly similar title" };
    }
  }
  return { duplicate: false, reason: null };
}

export function hasValidArtwork(path: {
  id?: string;
  artwork_public_url?: string | null;
  artwork_storage_path?: string | null;
  artwork_status?: string | null;
}): boolean {
  if (path.artwork_public_url?.trim()) return true;
  if (path.artwork_storage_path?.trim() && path.id) return true;
  const status = String(path.artwork_status ?? "").toLowerCase();
  return status === "category_fallback" || status === "source_thumbnail" || status === "generated";
}

export function verifyPathForPublication(input: PublishVerificationInput): PublishVerificationResult {
  const failedChecks: string[] = [];
  const reasons: string[] = [];
  const path = input.path;
  const minScore = input.minQualityScore ?? LIBRARY_BUILD_DEFAULT_QUALITY_THRESHOLD;

  if (!path.title?.trim()) {
    failedChecks.push("title");
    reasons.push("Course title is required.");
  }
  if (!path.short_description?.trim() && !path.description?.trim()) {
    failedChecks.push("description");
    reasons.push("Description is required.");
  }
  if (!path.category?.trim()) {
    failedChecks.push("category");
    reasons.push("Category is required.");
  }
  if (!path.difficulty?.trim()) {
    failedChecks.push("difficulty");
    reasons.push("Difficulty is required.");
  }
  const objectives = path.learning_objectives ?? [];
  if (!objectives.length || !objectives.some((o) => o.trim())) {
    failedChecks.push("learning_objectives");
    reasons.push("Learning objectives are required.");
  }
  if (!input.lessons.length) {
    failedChecks.push("lessons");
    reasons.push("At least one valid lesson is required.");
  }
  const badLesson = input.lessons.find(
    (l) => !l.youtube_video_id || !/^[\w-]{11}$/.test(l.youtube_video_id),
  );
  if (badLesson) {
    failedChecks.push("lesson_source_ids");
    reasons.push(`Lesson "${badLesson.title}" has an invalid YouTube video ID.`);
  }
  const positions = input.lessons.map((l) => l.position);
  if (positions.some((p) => !Number.isFinite(p))) {
    failedChecks.push("lesson_ordering");
    reasons.push("Lesson ordering is invalid.");
  }
  if (!path.source_playlist_id?.trim()) {
    failedChecks.push("source_playlist");
    reasons.push("Source playlist ID is required.");
  }
  if (!hasValidArtwork(path)) {
    failedChecks.push("artwork");
    reasons.push("Artwork must have AI, YouTube thumbnail, or category fallback — blank is not allowed.");
  }
  const qualityScore = path.quality_score ?? 0;
  if (qualityScore < minScore) {
    failedChecks.push("quality_threshold");
    reasons.push(`Quality score ${qualityScore} is below minimum ${minScore}.`);
  }
  if (path.certificate_enabled) {
    const price = resolveFinalCertificatePrice({
      mode: path.certificate_pricing_mode,
      recommendedPriceNgn: path.certificate_recommended_price_ngn,
      fixedPriceNgn: path.certificate_price_ngn,
    });
    const mode = (path.certificate_pricing_mode || "automatic").toLowerCase();
    if (mode !== "free" && price <= 0) {
      failedChecks.push("certificate_configuration");
      reasons.push("Certificate configuration is invalid.");
    }
    if (mode === "fixed" && price > 0 && !LEARN_CERTIFICATE_PRICE_TIERS.includes(price as LearnCertificatePriceTier)) {
      failedChecks.push("certificate_pricing");
      reasons.push("Fixed certificate price must use an approved tier.");
    }
  }
  const duration = path.estimated_duration_seconds;
  if (duration != null && (!Number.isFinite(duration) || duration < 0)) {
    failedChecks.push("estimated_duration");
    reasons.push("Estimated duration is invalid.");
  }
  for (const title of input.existingPublishedTitles ?? []) {
    if (titleSimilarity(path.title ?? "", title) >= 0.95) {
      failedChecks.push("duplicate_published");
      reasons.push("Duplicate published course title detected.");
      break;
    }
  }

  return { ok: failedChecks.length === 0, failedChecks, reasons };
}

export function canCreateDiscoveryJobToday(jobsToday: number, limit: number): boolean {
  return jobsToday < Math.max(1, limit);
}

export function retryDelayMs(retryCount: number): number {
  const base = 60_000;
  return Math.min(base * 2 ** Math.max(0, retryCount), 30 * 60_000);
}

export function isStaleJob(updatedAtIso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!updatedAtIso) return true;
  const updated = Date.parse(updatedAtIso);
  if (!Number.isFinite(updated)) return true;
  return nowMs - updated >= LIBRARY_BUILD_STALE_JOB_MS;
}

export function maintenanceCycleDue(
  lastMaintenanceAt: string | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastMaintenanceAt) return true;
  const last = Date.parse(lastMaintenanceAt);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= 7 * 24 * 60 * 60 * 1000;
}

export function expansionModeOnTargetIncrease(
  previousTarget: number,
  newTarget: number,
  publishedCount: number,
): { shouldResumeBulk: boolean; remaining: number } {
  if (newTarget <= previousTarget) {
    return { shouldResumeBulk: false, remaining: remainingToTarget(publishedCount, newTarget) };
  }
  return {
    shouldResumeBulk: publishedCount < newTarget,
    remaining: remainingToTarget(publishedCount, newTarget),
  };
}

export function settingsSnapshotFromRow(row: {
  target_published_count?: number | null;
  build_mode?: string | null;
  run_status?: string | null;
  quality_threshold?: number | null;
  discovery_jobs_per_day?: number | null;
  maintenance_max_per_week?: number | null;
  continuous_expansion_enabled?: boolean | null;
  discovery_backlog_target?: number | null;
  max_concurrent_discovery_jobs?: number | null;
  qualification_batch_size?: number | null;
  generation_batch_size?: number | null;
  publication_batch_size?: number | null;
  expansion_max_per_day?: number | null;
  stall_recovery_minutes?: number | null;
}): LibraryBuildSettingsSnapshot {
  return {
    targetPublishedCount: row.target_published_count ?? LIBRARY_BUILD_DEFAULT_TARGET,
    buildMode: (row.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (row.run_status ?? "idle") as LibraryRunStatus,
    qualityThreshold: row.quality_threshold ?? LIBRARY_BUILD_DEFAULT_QUALITY_THRESHOLD,
    discoveryJobsPerDay: row.discovery_jobs_per_day ?? LIBRARY_BUILD_DEFAULT_DISCOVERY_JOBS_PER_DAY,
    maintenanceMaxPerWeek: row.maintenance_max_per_week ?? LIBRARY_BUILD_DEFAULT_MAINTENANCE_MAX,
    continuousExpansionEnabled: row.continuous_expansion_enabled !== false,
    discoveryBacklogTarget: row.discovery_backlog_target ?? LIBRARY_BUILD_DEFAULT_DISCOVERY_BACKLOG_TARGET,
    maxConcurrentDiscoveryJobs:
      row.max_concurrent_discovery_jobs ?? LIBRARY_BUILD_DEFAULT_MAX_CONCURRENT_DISCOVERY_JOBS,
    qualificationBatchSize: row.qualification_batch_size ?? LIBRARY_BUILD_DEFAULT_QUALIFICATION_BATCH_SIZE,
    generationBatchSize: row.generation_batch_size ?? LIBRARY_BUILD_DEFAULT_GENERATION_BATCH_SIZE,
    publicationBatchSize: row.publication_batch_size ?? LIBRARY_BUILD_DEFAULT_PUBLICATION_BATCH_SIZE,
    expansionMaxPerDay:
      row.expansion_max_per_day != null && row.expansion_max_per_day > 0
        ? row.expansion_max_per_day
        : LIBRARY_BUILD_DEFAULT_EXPANSION_MAX_PER_DAY,
    stallRecoveryMinutes: row.stall_recovery_minutes ?? LIBRARY_BUILD_DEFAULT_STALL_RECOVERY_MINUTES,
  };
}

export function certUsdMappingExact(): boolean {
  for (const tier of LEARN_CERTIFICATE_PRICE_TIERS) {
    const expected = LEARN_CERTIFICATE_USD_BY_NGN[tier];
    if (tier === 2000 && expected !== 2) return false;
    if (tier === 3000 && expected !== 3) return false;
    if (tier === 5000 && expected !== 5) return false;
    if (tier === 7500 && expected !== 7.5) return false;
  }
  return true;
}

export function statsDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function resetDailyStatsIfNeeded(
  currentDay: string | null | undefined,
  today = statsDayKey(),
): boolean {
  return !currentDay || currentDay !== today;
}
