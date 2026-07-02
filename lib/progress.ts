import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomations } from "@/lib/automation";
import {
  clearIdleReminderForCourse,
  evaluateAndCompleteCourse,
} from "@/lib/course-completion";

/** All lesson ids belonging to a course (via its modules). */
async function courseLessonIds(courseId: string): Promise<string[]> {
  const supabase = createAdminClient();
  const { data: modules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return [];
  const { data: lessons } = await supabase
    .from("lessons")
    .select("id")
    .in("module_id", moduleIds);
  return (lessons ?? []).map((l) => l.id);
}

/** Returns 0-100 completion percentage for a student in a course. */
export async function courseCompletionPct(studentId: string, courseId: string) {
  const lessonIds = await courseLessonIds(courseId);
  if (lessonIds.length === 0) return 0;
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("lesson_progress")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("completed", true)
    .in("lesson_id", lessonIds);
  return Math.round(((count ?? 0) / lessonIds.length) * 100);
}

/**
 * Records lesson progress and, when thresholds are met, completes the course,
 * issues a certificate, fires emails/notifications and runs automations.
 * `studentId` MUST be the authenticated user's id (verified by the caller).
 */
export async function recordLessonProgress(params: {
  studentId: string;
  lessonId: string;
  watchPercentage?: number;
  completed?: boolean;
}) {
  const supabase = createAdminClient();
  const watch = Math.min(100, Math.max(0, params.watchPercentage ?? 0));
  const completed = params.completed ?? false;

  await supabase.from("lesson_progress").upsert(
    {
      student_id: params.studentId,
      lesson_id: params.lessonId,
      watch_percentage: watch,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    },
    { onConflict: "student_id,lesson_id" },
  );

  // Find the course this lesson belongs to.
  const { data: lesson } = await supabase
    .from("lessons")
    .select("module:modules(course_id)")
    .eq("id", params.lessonId)
    .single();
  const moduleRel = lesson?.module as { course_id: string } | { course_id: string }[] | null;
  const courseId = Array.isArray(moduleRel) ? moduleRel[0]?.course_id : moduleRel?.course_id;
  if (!courseId) return { completed: false };

  if (completed) {
    await clearIdleReminderForCourse(params.studentId, courseId);
  }

  if (!completed) return { completed: false };

  await runAutomations("lesson_completed", {
    studentId: params.studentId,
    courseId,
    lessonId: params.lessonId,
  });

  const completion = await evaluateAndCompleteCourse(params.studentId, courseId);
  const pct = completion.coursePct ?? (await courseCompletionPct(params.studentId, courseId));

  return { completed: true, coursePct: pct, courseCompleted: completion.completed };
}
