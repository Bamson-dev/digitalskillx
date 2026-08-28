import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json, LibraryBuildSettings } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import {
  countRecentDiscoverySearches,
  createDiscoveryRun,
  isYoutubeQuotaError,
} from "@/lib/content-factory/discovery";
import {
  canCreateDiscoveryJobToday,
  computeTopicCoverageStatus,
  countTowardLibraryTarget,
  discoveryJobsToCreate,
  discoveryQueriesForTopic,
  expansionModeOnTargetIncrease,
  hasReachedMinimumLibrarySize,
  isEngineStalled,
  maintenanceCycleDue,
  pickNextTopic,
  pickNextTopics,
  remainingToTarget,
  resetDailyStatsIfNeeded,
  resolveEffectiveBuildMode,
  resolveLibraryBuildPhase,
  settingsSnapshotFromRow,
  shouldContinueAutomatedDiscovery,
  statsDayKey,
  LIBRARY_BUILD_DEFAULT_DISCOVERY_BACKLOG_TARGET,
  LIBRARY_BUILD_DEFAULT_EXPANSION_MAX_PER_DAY,
  LIBRARY_BUILD_DEFAULT_GENERATION_BATCH_SIZE,
  LIBRARY_BUILD_DEFAULT_MAX_CONCURRENT_DISCOVERY_JOBS,
  LIBRARY_BUILD_DEFAULT_PUBLICATION_BATCH_SIZE,
  LIBRARY_BUILD_DEFAULT_QUALIFICATION_BATCH_SIZE,
  LIBRARY_BUILD_DEFAULT_STALL_RECOVERY_MINUTES,
  type LibraryBuildMode,
  type LibraryBuildPhase,
  type LibraryRunStatus,
  type TopicCoverageRow,
} from "@/lib/content-factory/library-build/library-build-shared";
import { LIBRARY_BUILD_SEED_CATEGORIES } from "@/lib/content-factory/library-build/seed-data";
import { syncLibraryBuildDiscoveryJobs } from "@/lib/content-factory/library-build/discovery-sync";
import { refreshTopicCoverageCounts } from "@/lib/content-factory/library-build/topic-coverage";
import { coveragePercentage, perTopicTargetCoverage } from "@/lib/content-factory/library-build/coverage-shared";

type Admin = SupabaseClient<Database>;

export type LibraryBuildPipelineCounts = {
  totalCandidatesQueued: number;
  pendingQualification: number;
  qualifiedCandidates: number;
  generating: number;
  awaitingVerification: number;
  readyToPublish: number;
  discoveryBacklog: number;
  activeTopics: number;
};

export type LibraryBuildStatus = {
  publishedCount: number;
  target: number;
  remaining: number;
  progressPercentage: number;
  buildMode: LibraryBuildMode;
  runStatus: LibraryRunStatus;
  effectiveMode: LibraryBuildMode;
  phase: LibraryBuildPhase;
  minimumLibrarySize: number;
  continuousExpansionEnabled: boolean;
  nextTopic: { id: string; name: string; categoryName: string } | null;
  activeTopics: Array<{ id: string; name: string; categoryName: string }>;
  lastJob: { id: string; status: string; completedAt: string | null } | null;
  lastSuccessfulActivity: string | null;
  lastError: string | null;
  pipeline: LibraryBuildPipelineCounts;
  stats: {
    candidatesToday: number;
    approvedToday: number;
    publishedToday: number;
    rejectedToday: number;
    jobsStartedToday: number;
    jobsCompletedToday: number;
    jobsFailedToday: number;
  };
  overall: {
    duplicatesBlocked: number;
    rejectedCandidates: number;
    failedJobs: number;
    activeJobs: number;
  };
  settings: Record<string, unknown>;
  coverage: TopicCoverageRow[];
};

function tablesMissing(message: string) {
  return isMissingRelationError(message);
}

export async function countPublishedLibraryCourses(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from("learning_paths")
    .select("id", { count: "exact", head: true })
    .eq("status", "published");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadSettingsRow(admin: Admin) {
  const { data, error } = await admin.from("library_build_settings").select("*").eq("id", "default").maybeSingle();
  if (error) {
    if (tablesMissing(error.message)) return null;
    throw new Error(error.message);
  }
  return data;
}

export async function logLibraryBuildActivity(
  admin: Admin,
  params: { kind: string; message: string; details?: Json; adminId?: string | null },
) {
  try {
    await admin.from("library_build_activity").insert({
      kind: params.kind,
      message: params.message,
      details: params.details ?? {},
      admin_id: params.adminId ?? null,
    });
  } catch {
    /* best effort */
  }
}

export async function seedLibraryBuildDefaults(admin: Admin) {
  const existing = await admin.from("library_build_categories").select("id").limit(1);
  if (existing.error && tablesMissing(existing.error.message)) return { seeded: false };
  if ((existing.data ?? []).length) return { seeded: false, reason: "already_seeded" };

  for (const category of LIBRARY_BUILD_SEED_CATEGORIES) {
    const { data: cat, error: catError } = await admin
      .from("library_build_categories")
      .insert({
        slug: category.slug,
        name: category.name,
        priority_weight: category.priorityWeight,
        minimum_coverage_goal: category.minimumCoverageGoal,
        preferred_target: category.preferredTarget,
        sort_order: category.sortOrder,
        active: true,
      })
      .select("id")
      .single();
    if (catError) throw new Error(catError.message);

    for (const topic of category.topics) {
      const targetCoverage = perTopicTargetCoverage(category.preferredTarget, category.topics.length, category.minimumCoverageGoal);
      const { error: topicError } = await admin.from("library_build_topics").insert({
        category_id: cat.id,
        slug: topic.slug,
        name: topic.name,
        priority_weight: topic.priorityWeight,
        discovery_queries: topic.discoveryQueries,
        target_coverage: targetCoverage,
        active: true,
        coverage_status: "high_priority",
      });
      if (topicError) throw new Error(topicError.message);
    }
  }
  await logLibraryBuildActivity(admin, {
    kind: "seed",
    message: "Seeded default library categories and topics.",
  });
  return { seeded: true };
}

export async function refreshTopicApprovedCounts(admin: Admin) {
  return refreshTopicCoverageCounts(admin);
}

export async function loadCoverageMap(admin: Admin): Promise<TopicCoverageRow[]> {
  await refreshTopicCoverageCounts(admin);
  const { data, error } = await admin
    .from("library_build_topics")
    .select(
      "id, name, slug, active, priority_weight, approved_course_count, published_course_count, target_coverage, coverage_status, library_build_categories(id, name, slug, minimum_coverage_goal, preferred_target, priority_weight, active)",
    )
    .order("priority_weight", { ascending: false });
  if (error) {
    if (tablesMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => {
    const cat = (row as {
      library_build_categories?: {
        name?: string;
        slug?: string;
        minimum_coverage_goal?: number;
        preferred_target?: number;
        priority_weight?: number;
        active?: boolean;
      };
    }).library_build_categories;
    const published = row.published_course_count ?? row.approved_course_count ?? 0;
    const target = row.target_coverage ?? 5;
    return {
      id: row.id,
      name: row.name,
      categoryName: cat?.name ?? "Unknown",
      categorySlug: cat?.slug ?? "unknown",
      approvedCourseCount: row.approved_course_count ?? published,
      publishedCourseCount: published,
      targetCoverage: target,
      coveragePercentage: coveragePercentage(published, target),
      priorityWeight: row.priority_weight ?? 50,
      active: row.active !== false && cat?.active !== false,
      coverageStatus: (row.coverage_status ?? "unknown") as TopicCoverageRow["coverageStatus"],
      minimumCategoryGoal: cat?.minimum_coverage_goal,
      preferredCategoryTarget: cat?.preferred_target,
      categoryPriorityWeight: cat?.priority_weight,
    };
  });
}

async function countOpenDiscoveryJobs(admin: Admin): Promise<number> {
  const { count, error } = await admin
    .from("library_build_discovery_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  if (error) {
    if (tablesMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

export async function getPipelineQueueCounts(admin: Admin): Promise<LibraryBuildPipelineCounts> {
  const [
    discovered,
    qualified,
    pendingJobs,
    processingJobs,
    waitingReview,
    reviewPaths,
    openLbJobs,
    activeTopicJobs,
  ] = await Promise.all([
    admin
      .from("content_factory_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "discovered"),
    admin
      .from("content_factory_candidates")
      .select("id", { count: "exact", head: true })
      .eq("status", "qualified")
      .eq("quality_status", "qualified")
      .is("factory_job_id", null)
      .is("learning_path_id", null),
    admin.from("content_factory_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin
      .from("content_factory_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing"),
    admin
      .from("content_factory_jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "waiting_review"),
    admin
      .from("learning_paths")
      .select("id", { count: "exact", head: true })
      .eq("status", "review"),
    countOpenDiscoveryJobs(admin),
    admin
      .from("library_build_discovery_jobs")
      .select("topic_id", { count: "exact", head: true })
      .in("status", ["queued", "running"]),
  ]);

  const pendingQualification = discovered.count ?? 0;
  const qualifiedCandidates = qualified.count ?? 0;
  const generating = (pendingJobs.count ?? 0) + (processingJobs.count ?? 0);
  const awaitingVerification = waitingReview.count ?? 0;
  const readyToPublish = reviewPaths.count ?? 0;

  return {
    totalCandidatesQueued: pendingQualification + qualifiedCandidates + generating + awaitingVerification,
    pendingQualification,
    qualifiedCandidates,
    generating,
    awaitingVerification,
    readyToPublish,
    discoveryBacklog: openLbJobs,
    activeTopics: activeTopicJobs.count ?? 0,
  };
}

export async function getLibraryBuildThroughputSettings(admin: Admin) {
  const settings = await loadSettingsRow(admin);
  if (!settings) return null;
  const snap = settingsSnapshotFromRow(settings);
  return {
    ...snap,
    qualificationBatchSize: snap.qualificationBatchSize,
    generationBatchSize: snap.generationBatchSize,
    publicationBatchSize: snap.publicationBatchSize,
  };
}

export async function recordLibraryBuildActivity(admin: Admin, kind: string) {
  const now = new Date().toISOString();
  try {
    await admin
      .from("library_build_settings")
      .update({ last_successful_activity_at: now, updated_at: now })
      .eq("id", "default");
  } catch {
    /* optional column before migration */
  }
  if (kind === "pipeline_progress") return;
  await logLibraryBuildActivity(admin, { kind, message: `Pipeline activity: ${kind.replace(/_/g, " ")}.` });
}

async function recordEngineError(admin: Admin, message: string) {
  const now = new Date().toISOString();
  try {
    await admin
      .from("library_build_settings")
      .update({ last_error: message.slice(0, 500), last_error_at: now, updated_at: now })
      .eq("id", "default");
  } catch {
    /* optional */
  }
}

function resolveRunningBuildMode(
  publishedCount: number,
  target: number,
  continuousExpansionEnabled: boolean,
): LibraryBuildMode {
  if (hasReachedMinimumLibrarySize(publishedCount, target) && continuousExpansionEnabled) {
    return "continuous";
  }
  return "bulk";
}

async function ensureBuildModeForPublishedCount(
  admin: Admin,
  settings: NonNullable<Awaited<ReturnType<typeof loadSettingsRow>>>,
  publishedCount: number,
) {
  const target = settings.target_published_count ?? 300;
  const continuous = settings.continuous_expansion_enabled !== false;
  if (!hasReachedMinimumLibrarySize(publishedCount, target) || !continuous) return settings;
  if (settings.run_status !== "running") return settings;
  if (settings.build_mode === "continuous" && settings.run_status === "running") return settings;

  const { data } = await admin
    .from("library_build_settings")
    .update({
      build_mode: "continuous",
      run_status: "running",
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default")
    .select("*")
    .single();

  await logLibraryBuildActivity(admin, {
    kind: "continuous_expansion",
    message: `Minimum library size reached (${publishedCount}/${target}). Switched to continuous expansion — engine keeps running.`,
    details: { publishedCount, target },
  });
  return data ?? settings;
}

async function countDiscoveryJobsToday(admin: Admin): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { count, error } = await admin
    .from("library_build_discovery_jobs")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since.toISOString())
    .neq("status", "cancelled");
  if (error) {
    if (tablesMissing(error.message)) return 0;
    throw new Error(error.message);
  }
  return count ?? 0;
}

async function syncDailyStats(admin: Admin, settings: NonNullable<Awaited<ReturnType<typeof loadSettingsRow>>>) {
  const today = statsDayKey();
  if (!resetDailyStatsIfNeeded(settings.stats_day, today)) return settings;
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
  return data ?? settings;
}

export async function getLibraryBuildStatus(admin: Admin): Promise<LibraryBuildStatus | null> {
  let settings = await loadSettingsRow(admin);
  if (!settings) return null;
  settings = await syncDailyStats(admin, settings);
  if (!settings) return null;

  const publishedCount = await countPublishedLibraryCourses(admin);
  const target = settings.target_published_count ?? 300;
  const continuousExpansionEnabled = settings.continuous_expansion_enabled !== false;
  const effectiveMode = resolveEffectiveBuildMode({
    settingsMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    publishedCount,
    target,
    continuousExpansionEnabled,
  });
  const phase = resolveLibraryBuildPhase({
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    buildMode: effectiveMode,
    publishedCount,
    minimumLibrarySize: target,
    continuousExpansionEnabled,
  });
  const coverage = await loadCoverageMap(admin);
  const remaining = remainingToTarget(publishedCount, target);
  const next = pickNextTopic(coverage, remaining);
  const activeTopicRows = pickNextTopics(
    coverage,
    remaining,
    settings.max_concurrent_discovery_jobs ?? LIBRARY_BUILD_DEFAULT_MAX_CONCURRENT_DISCOVERY_JOBS,
  );
  const pipeline = await getPipelineQueueCounts(admin);
  const { count: activeJobs } = await admin
    .from("library_build_discovery_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  const { data: lastJob } = await admin
    .from("library_build_discovery_jobs")
    .select("id, status, completed_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    publishedCount,
    target,
    remaining,
    progressPercentage: target > 0 ? Math.min(100, Math.round((publishedCount / target) * 100)) : 0,
    buildMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    effectiveMode,
    phase,
    minimumLibrarySize: target,
    continuousExpansionEnabled,
    nextTopic: next
      ? { id: next.id, name: next.name, categoryName: next.categoryName }
      : null,
    activeTopics: activeTopicRows.map((row) => ({
      id: row.id,
      name: row.name,
      categoryName: row.categoryName,
    })),
    lastJob: lastJob
      ? { id: lastJob.id, status: lastJob.status, completedAt: lastJob.completed_at }
      : null,
    lastSuccessfulActivity: settings.last_successful_activity_at ?? null,
    lastError: settings.last_error ?? null,
    pipeline,
    stats: {
      candidatesToday: settings.candidates_today ?? 0,
      approvedToday: settings.approved_today ?? 0,
      publishedToday: settings.published_today ?? 0,
      rejectedToday: settings.rejected_today ?? 0,
      jobsStartedToday: settings.jobs_started_today ?? 0,
      jobsCompletedToday: settings.jobs_completed_today ?? 0,
      jobsFailedToday: settings.jobs_failed_today ?? 0,
    },
    overall: {
      duplicatesBlocked: settings.duplicates_blocked_total ?? 0,
      rejectedCandidates: settings.rejected_candidates_total ?? 0,
      failedJobs: settings.failed_jobs_total ?? 0,
      activeJobs: activeJobs ?? 0,
    },
    settings: settings as Record<string, unknown>,
    coverage,
  };
}

export async function startLibraryBuild(admin: Admin, adminId: string) {
  if (!contentFactoryEnabled()) throw new Error("Content Factory is disabled.");
  await seedLibraryBuildDefaults(admin);
  const publishedCount = await countPublishedLibraryCourses(admin);
  const settings = await loadSettingsRow(admin);
  const target = settings?.target_published_count ?? 300;
  const buildMode = resolveRunningBuildMode(
    publishedCount,
    target,
    settings?.continuous_expansion_enabled !== false,
  );
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: buildMode,
      run_status: "running",
      started_at: new Date().toISOString(),
      paused_at: null,
      stopped_at: null,
      completed_at: null,
      last_successful_activity_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, {
    kind: "start",
    message: `Library build started (${buildMode}).`,
    adminId,
    details: { publishedCount, target },
  });
  // Create the first discovery job in-process so start does not depend solely on async cron kick.
  try {
    await fillDiscoveryBacklog(admin, { adminId });
  } catch (err) {
    await logLibraryBuildActivity(admin, {
      kind: "discovery_job_failed",
      message: "Initial discovery tick failed after start.",
      adminId,
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
  return getLibraryBuildStatus(admin);
}

export async function pauseLibraryBuild(admin: Admin, adminId: string) {
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: "paused",
      run_status: "paused",
      paused_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, { kind: "pause", message: "Library build paused.", adminId });
  return getLibraryBuildStatus(admin);
}

export async function resumeLibraryBuild(admin: Admin, adminId: string) {
  const publishedCount = await countPublishedLibraryCourses(admin);
  const settings = await loadSettingsRow(admin);
  const target = settings?.target_published_count ?? 300;
  const buildMode = resolveRunningBuildMode(
    publishedCount,
    target,
    settings?.continuous_expansion_enabled !== false,
  );
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: buildMode,
      run_status: "running",
      paused_at: null,
      completed_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, { kind: "resume", message: "Library build resumed.", adminId });
  try {
    await fillDiscoveryBacklog(admin, { adminId });
  } catch (err) {
    await logLibraryBuildActivity(admin, {
      kind: "discovery_job_failed",
      message: "Discovery tick failed after resume.",
      adminId,
      details: { error: err instanceof Error ? err.message : String(err) },
    });
  }
  return getLibraryBuildStatus(admin);
}

export async function stopLibraryBuild(admin: Admin, adminId: string) {
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: "stopped",
      run_status: "stopped",
      stopped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, { kind: "stop", message: "Library build stopped.", adminId });
  return getLibraryBuildStatus(admin);
}

export async function updateLibraryBuildSettings(
  admin: Admin,
  adminId: string,
  patch: {
    targetPublishedCount?: number;
    qualityThreshold?: number;
    discoveryJobsPerDay?: number;
    maintenanceMaxPerWeek?: number;
    discoveryBacklogTarget?: number;
    maxConcurrentDiscoveryJobs?: number;
    qualificationBatchSize?: number;
    generationBatchSize?: number;
    publicationBatchSize?: number;
    expansionMaxPerDay?: number;
    stallRecoveryMinutes?: number;
    continuousExpansionEnabled?: boolean;
  },
) {
  const settings = await loadSettingsRow(admin);
  const previousTarget = settings?.target_published_count ?? 300;
  const updates: Partial<LibraryBuildSettings> = { updated_at: new Date().toISOString() };
  if (patch.targetPublishedCount != null) updates.target_published_count = patch.targetPublishedCount;
  if (patch.qualityThreshold != null) updates.quality_threshold = patch.qualityThreshold;
  if (patch.discoveryJobsPerDay != null) updates.discovery_jobs_per_day = patch.discoveryJobsPerDay;
  if (patch.maintenanceMaxPerWeek != null) updates.maintenance_max_per_week = patch.maintenanceMaxPerWeek;
  if (patch.discoveryBacklogTarget != null) updates.discovery_backlog_target = patch.discoveryBacklogTarget;
  if (patch.maxConcurrentDiscoveryJobs != null) {
    updates.max_concurrent_discovery_jobs = patch.maxConcurrentDiscoveryJobs;
  }
  if (patch.qualificationBatchSize != null) updates.qualification_batch_size = patch.qualificationBatchSize;
  if (patch.generationBatchSize != null) updates.generation_batch_size = patch.generationBatchSize;
  if (patch.publicationBatchSize != null) updates.publication_batch_size = patch.publicationBatchSize;
  if (patch.expansionMaxPerDay != null) updates.expansion_max_per_day = patch.expansionMaxPerDay;
  if (patch.stallRecoveryMinutes != null) updates.stall_recovery_minutes = patch.stallRecoveryMinutes;
  if (patch.continuousExpansionEnabled != null) {
    updates.continuous_expansion_enabled = patch.continuousExpansionEnabled;
  }

  if (patch.targetPublishedCount != null) {
    const publishedCount = await countPublishedLibraryCourses(admin);
    const expansion = expansionModeOnTargetIncrease(previousTarget, patch.targetPublishedCount, publishedCount);
    if (expansion.shouldResumeBulk && settings?.run_status === "running") {
      updates.build_mode = "expansion";
      updates.run_status = "running";
      updates.completed_at = null;
    } else if (
      publishedCount >= patch.targetPublishedCount &&
      settings?.continuous_expansion_enabled === false
    ) {
      updates.build_mode = "maintenance";
      updates.run_status = settings?.run_status === "running" ? "completed" : settings?.run_status;
      updates.completed_at = settings?.completed_at ?? new Date().toISOString();
    } else if (publishedCount >= patch.targetPublishedCount && settings?.run_status === "running") {
      updates.build_mode = "continuous";
      updates.run_status = "running";
      updates.completed_at = null;
    }
  }

  const { error } = await admin.from("library_build_settings").update(updates).eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, {
    kind: "settings_update",
    message: "Library build settings updated.",
    adminId,
    details: patch as Json,
  });
  return getLibraryBuildStatus(admin);
}

async function countMaintenanceApprovedThisWeek(admin: Admin): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("library_build_activity")
    .select("id", { count: "exact", head: true })
    .eq("kind", "candidate_approved")
    .gte("created_at", since);
  if (error) return 0;
  return count ?? 0;
}

async function createLibraryDiscoveryJob(
  admin: Admin,
  params: {
    adminId: string;
    mode: LibraryBuildMode;
    topic: {
      id: string;
      name: string;
      discoveryQueries: string[];
      categoryId: string;
    };
  },
) {
  const run = await createDiscoveryRun(admin, {
    adminId: params.adminId,
    topic: params.topic.discoveryQueries[0] ?? params.topic.name,
    targetGenerate: 3,
    skipCooldown: true,
  });

  await admin
    .from("content_factory_discovery_runs")
    .update({
      library_topic_id: params.topic.id,
      library_build_mode:
        params.mode === "expansion"
          ? "expansion"
          : params.mode === "maintenance"
            ? "maintenance"
            : params.mode === "continuous"
              ? "continuous"
              : "bulk",
    })
    .eq("id", run.id);

  const { data: job, error } = await admin
    .from("library_build_discovery_jobs")
    .insert({
      mode:
        params.mode === "expansion"
          ? "expansion"
          : params.mode === "maintenance"
            ? "maintenance"
            : params.mode === "continuous"
              ? "continuous"
              : "bulk",
      category_id: params.topic.categoryId,
      topic_id: params.topic.id,
      discovery_run_id: run.id,
      status: run.reused ? "completed" : "queued",
      search_queries: params.topic.discoveryQueries,
      started_at: run.reused ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await admin
    .from("library_build_topics")
    .update({
      last_discovery_job_at: new Date().toISOString(),
      last_searched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.topic.id);

  await admin
    .from("library_build_settings")
    .update({
      next_topic_id: params.topic.id,
      last_job_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");

  return { jobId: job.id, runId: run.id, reused: Boolean(run.reused) };
}

export async function fillDiscoveryBacklog(
  admin: Admin,
  opts?: { adminId?: string | null },
): Promise<{ created: number; reasons: string[]; jobIds: string[] }> {
  const reasons: string[] = [];
  const jobIds: string[] = [];
  if (!contentFactoryEnabled()) return { created: 0, reasons: ["feature_disabled"], jobIds };

  let settings = await loadSettingsRow(admin);
  if (!settings) return { created: 0, reasons: ["tables_missing"], jobIds };
  settings = await syncDailyStats(admin, settings);

  const publishedCount = await countPublishedLibraryCourses(admin);
  const target = settings.target_published_count ?? 300;
  settings = await ensureBuildModeForPublishedCount(admin, settings, publishedCount);

  const continuousExpansionEnabled = settings.continuous_expansion_enabled !== false;
  const effectiveMode = resolveEffectiveBuildMode({
    settingsMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    publishedCount,
    target,
    continuousExpansionEnabled,
  });

  if (settings.run_status !== "running") {
    return { created: 0, reasons: ["not_running"], jobIds };
  }

  const maintenanceApproved = await countMaintenanceApprovedThisWeek(admin);
  if (
    !shouldContinueAutomatedDiscovery({
      runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
      buildMode: effectiveMode,
      publishedCount,
      target,
      continuousExpansionEnabled,
      publishedToday: settings.published_today ?? 0,
      expansionMaxPerDay: settings.expansion_max_per_day ?? LIBRARY_BUILD_DEFAULT_EXPANSION_MAX_PER_DAY,
      maintenanceApprovedThisWeek: maintenanceApproved,
      maintenanceMaxPerWeek: settings.maintenance_max_per_week ?? 20,
    })
  ) {
    if (effectiveMode === "maintenance" && !maintenanceCycleDue(settings.last_maintenance_at)) {
      return { created: 0, reasons: ["maintenance_not_due"], jobIds };
    }
    if (effectiveMode === "continuous") {
      return { created: 0, reasons: ["expansion_daily_cap_reached"], jobIds };
    }
    if (effectiveMode === "maintenance" && maintenanceApproved >= (settings.maintenance_max_per_week ?? 20)) {
      return { created: 0, reasons: ["maintenance_cap_reached"], jobIds };
    }
    return { created: 0, reasons: ["paused_or_stopped"], jobIds };
  }

  if (effectiveMode === "maintenance" && maintenanceCycleDue(settings.last_maintenance_at)) {
    await admin
      .from("library_build_settings")
      .update({ last_maintenance_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", "default");
  }

  const jobsToday = await countDiscoveryJobsToday(admin);
  const dailyLimit = settings.discovery_jobs_per_day ?? 12;
  const openJobs = await countOpenDiscoveryJobs(admin);
  const backlogTarget = settings.discovery_backlog_target ?? LIBRARY_BUILD_DEFAULT_DISCOVERY_BACKLOG_TARGET;
  const maxConcurrent =
    settings.max_concurrent_discovery_jobs ?? LIBRARY_BUILD_DEFAULT_MAX_CONCURRENT_DISCOVERY_JOBS;

  const toCreate = discoveryJobsToCreate({
    openJobs,
    backlogTarget,
    maxConcurrent,
    jobsToday,
    dailyLimit,
  });
  if (toCreate <= 0) {
    if (!canCreateDiscoveryJobToday(jobsToday, dailyLimit)) reasons.push("daily_job_cap");
    else if (openJobs >= Math.min(backlogTarget, maxConcurrent)) reasons.push("discovery_backlog_full");
    else reasons.push("no_slots");
    return { created: 0, reasons, jobIds };
  }

  const youtubeUsed = await countRecentDiscoverySearches(admin);
  const youtubeCap = dailyLimit + 10;
  if (youtubeUsed >= youtubeCap) {
    await logLibraryBuildActivity(admin, {
      kind: "rate_limited",
      message: "YouTube search cap reached; qualify/generate/publish continue.",
      details: { youtubeUsed, youtubeCap },
    });
    return { created: 0, reasons: ["youtube_quota"], jobIds };
  }

  let adminId = opts?.adminId ?? null;
  if (!adminId) {
    const { data: adminProfile } = await admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    adminId = adminProfile?.id ?? null;
  }
  if (!adminId) return { created: 0, reasons: ["no_admin"], jobIds };

  await refreshTopicCoverageCounts(admin);
  const coverage = await loadCoverageMap(admin);
  const remaining = remainingToTarget(publishedCount, target);
  const usedTopicIds = new Set<string>();
  let created = 0;

  for (let i = 0; i < toCreate; i += 1) {
    const nextTopics = pickNextTopics(coverage, remaining, 1, usedTopicIds);
    const next = nextTopics[0];
    if (!next) {
      reasons.push("no_topic");
      break;
    }
    usedTopicIds.add(next.id);

    const { data: topicRow } = await admin
      .from("library_build_topics")
      .select("id, name, category_id, discovery_queries")
      .eq("id", next.id)
      .maybeSingle();
    if (!topicRow) {
      reasons.push("topic_missing");
      continue;
    }

    const queries = discoveryQueriesForTopic(
      topicRow.name,
      (topicRow.discovery_queries as string[] | null) ?? [],
    );

    try {
      const job = await createLibraryDiscoveryJob(admin, {
        adminId,
        mode: effectiveMode,
        topic: {
          id: topicRow.id,
          name: topicRow.name,
          discoveryQueries: queries,
          categoryId: topicRow.category_id,
        },
      });
      jobIds.push(job.jobId);
      created += 1;
      await logLibraryBuildActivity(admin, {
        kind: "discovery_job_created",
        message: `Discovery job for ${next.categoryName} → ${next.name}`,
        details: { jobId: job.jobId, runId: job.runId, mode: effectiveMode },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await recordEngineError(admin, message);
      if (isYoutubeQuotaError(message) || /daily youtube search cap/i.test(message)) {
        await logLibraryBuildActivity(admin, {
          kind: "rate_limited",
          message: "YouTube quota/rate limit encountered; other pipeline stages continue.",
          details: { error: message },
        });
        reasons.push("youtube_quota");
        break;
      }
      await logLibraryBuildActivity(admin, {
        kind: "discovery_job_failed",
        message: "Failed to create discovery job; continuing with other topics.",
        details: { error: message, topicId: next.id },
      });
      reasons.push("error");
    }
  }

  if (created > 0) {
    await recordLibraryBuildActivity(admin, "discovery_backlog");
  }

  return { created, reasons, jobIds };
}

export async function attemptStallRecovery(
  admin: Admin,
): Promise<{ attempted: boolean; reason?: string }> {
  const settings = await loadSettingsRow(admin);
  if (!settings || settings.run_status !== "running") {
    return { attempted: false, reason: "not_running" };
  }

  const publishedCount = await countPublishedLibraryCourses(admin);
  const target = settings.target_published_count ?? 300;
  if (hasReachedMinimumLibrarySize(publishedCount, target)) {
    return { attempted: false, reason: "minimum_reached" };
  }

  const pipeline = await getPipelineQueueCounts(admin);
  const activeJobs = pipeline.discoveryBacklog + pipeline.generating;
  const stalled = isEngineStalled({
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    publishedCount,
    minimumLibrarySize: target,
    lastSuccessfulActivityAt: settings.last_successful_activity_at,
    stallRecoveryMinutes: settings.stall_recovery_minutes ?? LIBRARY_BUILD_DEFAULT_STALL_RECOVERY_MINUTES,
    activeJobs,
    pendingCandidates: pipeline.pendingQualification,
    pipelineQueued: pipeline.totalCandidatesQueued,
  });

  if (!stalled) return { attempted: false, reason: "not_stalled" };

  await logLibraryBuildActivity(admin, {
    kind: "stall_recovery",
    message: `Engine stalled below minimum (${publishedCount}/${target}); creating discovery work.`,
    details: { publishedCount, target, pipeline },
  });

  const backlog = await fillDiscoveryBacklog(admin);
  return { attempted: true, reason: backlog.created > 0 ? "recovered" : backlog.reasons[0] ?? "no_work_created" };
}

/** @deprecated Prefer fillDiscoveryBacklog via throughput pipeline. */
export async function tickLibraryBuildEngine(
  admin: Admin,
  opts?: { adminId?: string | null },
): Promise<{ ticked: boolean; reason?: string; jobId?: string }> {
  const result = await fillDiscoveryBacklog(admin, opts);
  return {
    ticked: result.created > 0,
    reason: result.reasons[0],
    jobId: result.jobIds[0],
  };
}

export async function incrementLibraryBuildStat(
  admin: Admin,
  field: "candidates_today" | "approved_today" | "published_today" | "rejected_today",
  delta = 1,
) {
  const settings = await loadSettingsRow(admin);
  if (!settings) return;
  const synced = await syncDailyStats(admin, settings);
  if (!synced) return;
  const current =
    field === "candidates_today"
      ? synced.candidates_today
      : field === "approved_today"
        ? synced.approved_today
        : field === "published_today"
          ? synced.published_today
          : synced.rejected_today;
  const next = current + delta;
  const patch: Partial<LibraryBuildSettings> = { updated_at: new Date().toISOString() };
  if (field === "candidates_today") patch.candidates_today = next;
  else if (field === "approved_today") patch.approved_today = next;
  else if (field === "published_today") patch.published_today = next;
  else patch.rejected_today = next;
  await admin.from("library_build_settings").update(patch).eq("id", "default");
}

export { countTowardLibraryTarget };

/** Sync discovery job results and refresh coverage — safe to call every cron tick. */
export async function tickLibraryBuildMaintenance(admin: Admin) {
  await syncLibraryBuildDiscoveryJobs(admin);
  await refreshTopicCoverageCounts(admin);
}
