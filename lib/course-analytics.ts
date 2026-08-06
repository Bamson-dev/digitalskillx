import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type CourseAnalyticsSummary = {
  courseId: string;
  title: string;
  enrollments: number;
  courseStarts: number;
  completions: number;
  completionRate: number;
  dropOffRate: number;
  certificates: number;
  avgWatchPercentage: number;
  lessonsCompleted: number;
  mostWatchedLesson: { id: string; title: string; completions: number } | null;
  leastWatchedLesson: { id: string; title: string; completions: number } | null;
  avgCompletionHours: number | null;
};

/**
 * Course analytics from existing enrollments / lesson_progress / certificates.
 * Does not require video-provider analytics — prepared for future watch-time ingest.
 */
export async function getCourseAnalyticsSummaries(
  admin: SupabaseClient<Database>,
  limit = 12,
): Promise<CourseAnalyticsSummary[]> {
  const { data: courses } = await admin
    .from("courses")
    .select("id, title")
    .order("title")
    .limit(40);

  const summaries: CourseAnalyticsSummary[] = [];

  for (const course of courses ?? []) {
    const { data: enrollments } = await admin
      .from("enrollments")
      .select("id, student_id, enrolled_at, completed_at")
      .eq("course_id", course.id);

    const enrollmentRows = enrollments ?? [];
    const enrollmentCount = enrollmentRows.length;
    const completions = enrollmentRows.filter((e) => e.completed_at).length;
    const completionRate = enrollmentCount > 0 ? completions / enrollmentCount : 0;
    const dropOffRate = enrollmentCount > 0 ? 1 - completionRate : 0;

    const { data: modules } = await admin
      .from("modules")
      .select("id")
      .eq("course_id", course.id);
    const moduleIds = (modules ?? []).map((m) => m.id);
    let lessonRows: Array<{ id: string; title: string }> = [];
    if (moduleIds.length > 0) {
      const { data: lessons } = await admin
        .from("lessons")
        .select("id, title")
        .in("module_id", moduleIds);
      lessonRows = lessons ?? [];
    }
    const lessonIds = lessonRows.map((l) => l.id);

    let progress: Array<{
      lesson_id: string;
      completed: boolean;
      watch_percentage: number;
      student_id: string;
    }> = [];
    if (lessonIds.length > 0) {
      const { data } = await admin
        .from("lesson_progress")
        .select("lesson_id, completed, watch_percentage, student_id")
        .in("lesson_id", lessonIds);
      progress = data ?? [];
    }

    const studentsWithAnyProgress = new Set(progress.map((p) => p.student_id));
    const courseStarts = studentsWithAnyProgress.size;
    const lessonsCompleted = progress.filter((p) => p.completed).length;
    const avgWatchPercentage =
      progress.length > 0
        ? progress.reduce((sum, p) => sum + (p.watch_percentage ?? 0), 0) / progress.length
        : 0;

    const byLesson = new Map<string, number>();
    for (const p of progress) {
      if (!p.completed) continue;
      byLesson.set(p.lesson_id, (byLesson.get(p.lesson_id) ?? 0) + 1);
    }

    let most: CourseAnalyticsSummary["mostWatchedLesson"] = null;
    let least: CourseAnalyticsSummary["leastWatchedLesson"] = null;
    for (const lesson of lessonRows) {
      const count = byLesson.get(lesson.id) ?? 0;
      if (!most || count > most.completions) {
        most = { id: lesson.id, title: lesson.title, completions: count };
      }
      if (!least || count < least.completions) {
        least = { id: lesson.id, title: lesson.title, completions: count };
      }
    }

    const { count: certCount } = await admin
      .from("certificates")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course.id);

    let avgCompletionHours: number | null = null;
    const timed = enrollmentRows.filter((e) => e.enrolled_at && e.completed_at);
    if (timed.length > 0) {
      const hours =
        timed.reduce((sum, e) => {
          const start = new Date(e.enrolled_at!).getTime();
          const end = new Date(e.completed_at!).getTime();
          return sum + Math.max(0, end - start) / (1000 * 60 * 60);
        }, 0) / timed.length;
      avgCompletionHours = Math.round(hours * 10) / 10;
    }

    summaries.push({
      courseId: course.id,
      title: course.title,
      enrollments: enrollmentCount,
      courseStarts,
      completions,
      completionRate,
      dropOffRate,
      certificates: certCount ?? 0,
      avgWatchPercentage: Math.round(avgWatchPercentage * 10) / 10,
      lessonsCompleted,
      mostWatchedLesson: most,
      leastWatchedLesson: least,
      avgCompletionHours,
    });
  }

  return summaries
    .sort((a, b) => b.enrollments - a.enrollments)
    .slice(0, limit);
}

/**
 * Future detailed video analytics ingest shape (Cloudflare / Bunny / Mux).
 * Not wired to production players yet.
 */
export type VideoAnalyticsEvent = {
  provider: string;
  assetId: string;
  studentId: string;
  lessonId: string;
  watchedSeconds: number;
  durationSeconds: number | null;
  at: string;
};
