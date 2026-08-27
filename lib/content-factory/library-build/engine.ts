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
  discoveryQueriesForTopic,
  expansionModeOnTargetIncrease,
  maintenanceCycleDue,
  pickNextTopic,
  remainingToTarget,
  resetDailyStatsIfNeeded,
  resolveEffectiveBuildMode,
  shouldContinueAutomatedDiscovery,
  shouldStopBulkAtTarget,
  statsDayKey,
  type LibraryBuildMode,
  type LibraryRunStatus,
  type TopicCoverageRow,
} from "@/lib/content-factory/library-build/library-build-shared";
import { LIBRARY_BUILD_SEED_CATEGORIES } from "@/lib/content-factory/library-build/seed-data";
import { syncLibraryBuildDiscoveryJobs } from "@/lib/content-factory/library-build/discovery-sync";
import { refreshTopicCoverageCounts } from "@/lib/content-factory/library-build/topic-coverage";
import { coveragePercentage, perTopicTargetCoverage } from "@/lib/content-factory/library-build/coverage-shared";

type Admin = SupabaseClient<Database>;

export type LibraryBuildStatus = {
  publishedCount: number;
  target: number;
  remaining: number;
  progressPercentage: number;
  buildMode: LibraryBuildMode;
  runStatus: LibraryRunStatus;
  effectiveMode: LibraryBuildMode;
  nextTopic: { id: string; name: string; categoryName: string } | null;
  lastJob: { id: string; status: string; completedAt: string | null } | null;
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
  const effectiveMode = resolveEffectiveBuildMode({
    settingsMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    publishedCount,
    target,
  });
  const coverage = await loadCoverageMap(admin);
  const next = pickNextTopic(coverage, remainingToTarget(publishedCount, target));
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
    remaining: remainingToTarget(publishedCount, target),
    progressPercentage: target > 0 ? Math.min(100, Math.round((publishedCount / target) * 100)) : 0,
    buildMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    effectiveMode,
    nextTopic: next
      ? { id: next.id, name: next.name, categoryName: next.categoryName }
      : null,
    lastJob: lastJob
      ? { id: lastJob.id, status: lastJob.status, completedAt: lastJob.completed_at }
      : null,
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
  const buildMode: LibraryBuildMode = publishedCount >= target ? "maintenance" : "bulk";
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: buildMode,
      run_status: "running",
      started_at: new Date().toISOString(),
      paused_at: null,
      stopped_at: null,
      completed_at: publishedCount >= target ? settings?.completed_at : null,
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
    await tickLibraryBuildEngine(admin, { adminId });
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
  const buildMode: LibraryBuildMode = publishedCount >= target ? "maintenance" : "bulk";
  const { error } = await admin
    .from("library_build_settings")
    .update({
      build_mode: buildMode,
      run_status: "running",
      paused_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", "default");
  if (error) throw new Error(error.message);
  await logLibraryBuildActivity(admin, { kind: "resume", message: "Library build resumed.", adminId });
  try {
    await tickLibraryBuildEngine(admin, { adminId });
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
  },
) {
  const settings = await loadSettingsRow(admin);
  const previousTarget = settings?.target_published_count ?? 300;
  const updates: Partial<LibraryBuildSettings> = { updated_at: new Date().toISOString() };
  if (patch.targetPublishedCount != null) updates.target_published_count = patch.targetPublishedCount;
  if (patch.qualityThreshold != null) updates.quality_threshold = patch.qualityThreshold;
  if (patch.discoveryJobsPerDay != null) updates.discovery_jobs_per_day = patch.discoveryJobsPerDay;
  if (patch.maintenanceMaxPerWeek != null) updates.maintenance_max_per_week = patch.maintenanceMaxPerWeek;

  if (patch.targetPublishedCount != null) {
    const publishedCount = await countPublishedLibraryCourses(admin);
    const expansion = expansionModeOnTargetIncrease(previousTarget, patch.targetPublishedCount, publishedCount);
    if (expansion.shouldResumeBulk && settings?.run_status === "running") {
      updates.build_mode = "expansion";
      updates.run_status = "running";
      updates.completed_at = null;
    } else if (publishedCount >= patch.targetPublishedCount) {
      updates.build_mode = "maintenance";
      updates.run_status = settings?.run_status === "running" ? "completed" : settings?.run_status;
      updates.completed_at = settings?.completed_at ?? new Date().toISOString();
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
      library_build_mode: params.mode === "expansion" ? "expansion" : params.mode === "maintenance" ? "maintenance" : "bulk",
    })
    .eq("id", run.id);

  const { data: job, error } = await admin
    .from("library_build_discovery_jobs")
    .insert({
      mode: params.mode === "expansion" ? "expansion" : params.mode === "maintenance" ? "maintenance" : "bulk",
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

export async function tickLibraryBuildEngine(
  admin: Admin,
  opts?: { adminId?: string | null },
): Promise<{ ticked: boolean; reason?: string; jobId?: string }> {
  if (!contentFactoryEnabled()) return { ticked: false, reason: "feature_disabled" };

  let settings = await loadSettingsRow(admin);
  if (!settings) return { ticked: false, reason: "tables_missing" };
  settings = await syncDailyStats(admin, settings);

  const publishedCount = await countPublishedLibraryCourses(admin);
  const target = settings.target_published_count ?? 300;
  const effectiveMode = resolveEffectiveBuildMode({
    settingsMode: (settings.build_mode ?? "bulk") as LibraryBuildMode,
    runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
    publishedCount,
    target,
  });

  if (shouldStopBulkAtTarget(publishedCount, target) && effectiveMode === "bulk") {
    await admin
      .from("library_build_settings")
      .update({
        build_mode: "maintenance",
        run_status: settings.run_status === "running" ? "completed" : settings.run_status,
        completed_at: settings.completed_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", "default");
    await logLibraryBuildActivity(admin, {
      kind: "target_reached",
      message: `Bulk build target reached (${publishedCount}/${target}). Switching to maintenance.`,
      details: { publishedCount, target },
    });
    return { ticked: false, reason: "target_reached" };
  }

  const maintenanceApproved = await countMaintenanceApprovedThisWeek(admin);
  if (
    !shouldContinueAutomatedDiscovery({
      runStatus: (settings.run_status ?? "idle") as LibraryRunStatus,
      buildMode: effectiveMode,
      publishedCount,
      target,
      maintenanceApprovedThisWeek: maintenanceApproved,
      maintenanceMaxPerWeek: settings.maintenance_max_per_week ?? 20,
    })
  ) {
    if (effectiveMode === "maintenance" && !maintenanceCycleDue(settings.last_maintenance_at)) {
      return { ticked: false, reason: "maintenance_not_due" };
    }
    if (settings.run_status !== "running") return { ticked: false, reason: "not_running" };
    if (effectiveMode === "maintenance" && maintenanceApproved >= (settings.maintenance_max_per_week ?? 20)) {
      return { ticked: false, reason: "maintenance_cap_reached" };
    }
    return { ticked: false, reason: "paused_or_stopped" };
  }

  if (effectiveMode === "maintenance" && maintenanceCycleDue(settings.last_maintenance_at)) {
    await admin
      .from("library_build_settings")
      .update({ last_maintenance_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", "default");
  }

  const jobsToday = await countDiscoveryJobsToday(admin);
  const dailyLimit = settings.discovery_jobs_per_day ?? 12;
  if (!canCreateDiscoveryJobToday(jobsToday, dailyLimit)) {
    return { ticked: false, reason: "daily_job_cap" };
  }

  // Do not enqueue more discovery while Library Build already has in-flight work.
  // Queued runs inflate the YouTube search reservation counter and starve qualification.
  const { count: openLbJobs } = await admin
    .from("library_build_discovery_jobs")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "running"]);
  if ((openLbJobs ?? 0) > 0) {
    return { ticked: false, reason: "discovery_backlog" };
  }

  const youtubeUsed = await countRecentDiscoverySearches(admin);
  const youtubeCap = dailyLimit + 10;
  if (youtubeUsed >= youtubeCap) {
    return { ticked: false, reason: "youtube_quota" };
  }

  await refreshTopicCoverageCounts(admin);
  const coverage = await loadCoverageMap(admin);
  const next = pickNextTopic(coverage, remainingToTarget(publishedCount, target));
  if (!next) return { ticked: false, reason: "no_topic" };

  const { data: topicRow } = await admin
    .from("library_build_topics")
    .select("id, name, category_id, discovery_queries")
    .eq("id", next.id)
    .maybeSingle();
  if (!topicRow) return { ticked: false, reason: "topic_missing" };

  let adminId = opts?.adminId ?? null;
  if (!adminId) {
    const { data: adminProfile } = await admin.from("profiles").select("id").eq("role", "admin").limit(1).maybeSingle();
    adminId = adminProfile?.id ?? null;
  }
  if (!adminId) return { ticked: false, reason: "no_admin" };

  const queries = discoveryQueriesForTopic(
    topicRow.name,
    (topicRow.discovery_queries as string[] | null) ?? [],
  );

  try {
    const created = await createLibraryDiscoveryJob(admin, {
      adminId,
      mode: effectiveMode,
      topic: {
        id: topicRow.id,
        name: topicRow.name,
        discoveryQueries: queries,
        categoryId: topicRow.category_id,
      },
    });
    await logLibraryBuildActivity(admin, {
      kind: "discovery_job_created",
      message: `Discovery job for ${next.categoryName} → ${next.name}`,
      details: { jobId: created.jobId, runId: created.runId, mode: effectiveMode },
    });
    return { ticked: true, jobId: created.jobId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isYoutubeQuotaError(message)) {
      await logLibraryBuildActivity(admin, {
        kind: "rate_limited",
        message: "YouTube quota/rate limit encountered.",
        details: { error: message },
      });
      return { ticked: false, reason: "rate_limited" };
    }
    await logLibraryBuildActivity(admin, {
      kind: "discovery_job_failed",
      message: "Failed to create discovery job.",
      details: { error: message },
    });
    return { ticked: false, reason: "error" };
  }
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
