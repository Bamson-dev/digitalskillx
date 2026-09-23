import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { summarizeLearnCompletion } from "@/lib/content-factory/library-shared";
import { listRequiredLessonIds } from "@/lib/learn-progress";
import { isMissingRelationError } from "@/lib/schema-guard";
import { recommendLearningPaths, type LearnerPathHistory } from "@/lib/learn-discovery/discovery-shared";
import { listDiscoverableLearningLibrary } from "@/lib/learn-discovery/discovery";
import { loadLearnerStreak } from "@/lib/learn-discovery/streaks";
import { loadLearnerAchievements } from "@/lib/learn-discovery/achievements";

type Admin = SupabaseClient<Database>;

export type LearnerPathProgressRow = {
  pathId: string;
  slug: string;
  title: string;
  category: string;
  difficulty: string | null;
  artworkPublicUrl: string | null;
  estimatedDurationSeconds: number | null;
  certificateEnabled: boolean;
  certificatePricingMode: string | null;
  completedLessons: number;
  totalLessons: number;
  progressPct: number;
  isComplete: boolean;
  lastActivityAt: string | null;
  resumeLessonNumber: number | null;
  resumeHref: string;
};

export type LearnerDashboardSnapshot = {
  continueLearning: LearnerPathProgressRow[];
  inProgress: LearnerPathProgressRow[];
  completed: LearnerPathProgressRow[];
  eligibleForCertificate: LearnerPathProgressRow[];
  certificatesEarned: Array<{
    id: string;
    certificateNumber: string;
    issuedAt: string;
    pathTitle: string | null;
    pathSlug: string | null;
  }>;
  recommendations: Array<{
    id: string;
    slug: string;
    title: string;
    shortDescription: string;
    category: string;
    difficulty: string | null;
    artworkPublicUrl: string | null;
  }>;
  analytics: {
    coursesStarted: number;
    coursesCompleted: number;
    coursesInProgress: number;
    lessonsCompleted: number;
    currentStreak: number;
    longestStreak: number;
    achievementsEarned: number;
  };
  streak: { currentStreak: number; longestStreak: number; lastActiveDay: string | null };
  achievements: Array<{ code: string; title: string; description: string; earnedAt: string }>;
};

async function loadProgressRows(admin: Admin, studentId: string) {
  const { data, error } = await admin
    .from("learning_path_progress")
    .select("learning_path_id, lesson_id, completed_at")
    .eq("student_id", studentId)
    .order("completed_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function buildPathRow(
  admin: Admin,
  studentId: string,
  pathId: string,
  progressRows: Array<{ lesson_id: string; completed_at: string }>,
): Promise<LearnerPathProgressRow | null> {
  const { data: path, error } = await admin
    .from("learning_paths")
    .select(
      "id, slug, title, category, difficulty, artwork_public_url, estimated_duration_seconds, certificate_enabled, certificate_pricing_mode, status",
    )
    .eq("id", pathId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!path) return null;

  const required = await listRequiredLessonIds(admin, pathId);
  const progressMap: Record<string, boolean> = {};
  let lastActivityAt: string | null = null;
  for (const row of progressRows) {
    progressMap[row.lesson_id] = true;
    if (!lastActivityAt || row.completed_at > lastActivityAt) lastActivityAt = row.completed_at;
  }
  const summary = summarizeLearnCompletion(progressMap, required);

  let resumeLessonNumber: number | null = null;
  if (!summary.isComplete && required.length) {
    for (let i = 0; i < required.length; i += 1) {
      if (!progressMap[required[i]!]) {
        resumeLessonNumber = i + 1;
        break;
      }
    }
  }

  const anchor = resumeLessonNumber ? `#lesson-${resumeLessonNumber}` : "";
  return {
    pathId: path.id,
    slug: path.slug,
    title: path.title,
    category: path.category,
    difficulty: path.difficulty,
    artworkPublicUrl: path.artwork_public_url,
    estimatedDurationSeconds: path.estimated_duration_seconds ?? null,
    certificateEnabled: path.certificate_enabled === true,
    certificatePricingMode: path.certificate_pricing_mode ?? null,
    completedLessons: summary.completed,
    totalLessons: summary.total,
    progressPct: summary.pct,
    isComplete: summary.isComplete,
    lastActivityAt,
    resumeLessonNumber,
    resumeHref: `/learn/${path.slug}${anchor}`,
  };
}

export async function loadLearnerDashboard(admin: Admin, studentId: string): Promise<LearnerDashboardSnapshot> {
  const progressRows = await loadProgressRows(admin, studentId);
  const byPath = new Map<string, Array<{ lesson_id: string; completed_at: string }>>();
  for (const row of progressRows) {
    const list = byPath.get(row.learning_path_id) ?? [];
    list.push({ lesson_id: row.lesson_id, completed_at: row.completed_at });
    byPath.set(row.learning_path_id, list);
  }

  const pathRows: LearnerPathProgressRow[] = [];
  for (const [pathId, rows] of byPath) {
    const built = await buildPathRow(admin, studentId, pathId, rows);
    if (built) pathRows.push(built);
  }

  pathRows.sort((a, b) => {
    const at = a.lastActivityAt ?? "";
    const bt = b.lastActivityAt ?? "";
    return bt.localeCompare(at) || a.title.localeCompare(b.title);
  });

  const inProgress = pathRows.filter((row) => !row.isComplete);
  const completed = pathRows.filter((row) => row.isComplete);
  const continueLearning = inProgress.slice(0, 6);

  const { data: certs } = await admin
    .from("certificates")
    .select("id, certificate_number, issued_at, learning_path_id, learning_path:learning_paths(title, slug)")
    .eq("student_id", studentId)
    .not("learning_path_id", "is", null)
    .order("issued_at", { ascending: false });

  const certPathIds = new Set((certs ?? []).map((c) => c.learning_path_id).filter(Boolean));

  const eligibleForCertificate = completed.filter(
    (row) => row.certificateEnabled && !certPathIds.has(row.pathId),
  );

  const history: LearnerPathHistory[] = pathRows.map((row) => ({
    pathId: row.pathId,
    category: row.category,
    difficulty: row.difficulty,
    completed: row.isComplete,
    inProgress: !row.isComplete,
  }));

  const catalog = await listDiscoverableLearningLibrary(admin, { page: 1, pageSize: 120 });
  const recommendations = recommendLearningPaths({
    catalog: catalog.paths.map((p) => ({
      ...p,
      status: "published" as const,
    })),
    history,
    limit: 6,
  });

  const streak = await loadLearnerStreak(admin, studentId);
  const achievements = await loadLearnerAchievements(admin, studentId);

  const lessonsCompleted = progressRows.length;

  return {
    continueLearning,
    inProgress,
    completed,
    eligibleForCertificate,
    certificatesEarned: (certs ?? []).map((c) => ({
      id: c.id,
      certificateNumber: c.certificate_number,
      issuedAt: c.issued_at,
      pathTitle: (c.learning_path as { title?: string } | null)?.title ?? null,
      pathSlug: (c.learning_path as { slug?: string } | null)?.slug ?? null,
    })),
    recommendations: recommendations.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      shortDescription: p.short_description ?? "",
      category: p.category,
      difficulty: p.difficulty ?? null,
      artworkPublicUrl: p.artwork_public_url ?? null,
    })),
    analytics: {
      coursesStarted: pathRows.length,
      coursesCompleted: completed.length,
      coursesInProgress: inProgress.length,
      lessonsCompleted,
      currentStreak: streak.currentStreak,
      longestStreak: streak.longestStreak,
      achievementsEarned: achievements.length,
    },
    streak,
    achievements,
  };
}

export async function computeLearnerAchievementMetrics(admin: Admin, studentId: string) {
  const progressRows = await loadProgressRows(admin, studentId);
  const pathIds = [...new Set(progressRows.map((r) => r.learning_path_id))];
  let coursesCompleted = 0;
  for (const pathId of pathIds) {
    const rows = progressRows.filter((r) => r.learning_path_id === pathId);
    const required = await listRequiredLessonIds(admin, pathId);
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.lesson_id] = true;
    if (summarizeLearnCompletion(map, required).isComplete) coursesCompleted += 1;
  }
  return {
    lessonsCompleted: progressRows.length,
    coursesStarted: pathIds.length,
    coursesCompleted,
  };
}
