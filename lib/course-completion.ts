import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAutomations } from "@/lib/automation";
import { issueCertificate } from "@/lib/certificates";
import { courseCompletionPct } from "@/lib/progress";
import { notify } from "@/lib/notifications";
import { sendCourseCompletionCertificateEmail } from "@/lib/system-email-triggers";
import type { Database } from "@/types/database";

/** All quiz ids attached to lessons or modules in a course. */
export async function courseQuizIds(
  admin: SupabaseClient<Database>,
  courseId: string,
): Promise<string[]> {
  const { data: modules } = await admin
    .from("modules")
    .select("id")
    .eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((m) => m.id);
  if (moduleIds.length === 0) return [];

  const { data: lessons } = await admin
    .from("lessons")
    .select("id")
    .in("module_id", moduleIds);
  const lessonIds = (lessons ?? []).map((l) => l.id);

  const quizIds = new Set<string>();

  if (lessonIds.length > 0) {
    const { data: lessonQuizzes } = await admin
      .from("quizzes")
      .select("id")
      .in("lesson_id", lessonIds);
    for (const q of lessonQuizzes ?? []) quizIds.add(q.id);
  }

  const { data: moduleQuizzes } = await admin
    .from("quizzes")
    .select("id")
    .in("module_id", moduleIds);
  for (const q of moduleQuizzes ?? []) quizIds.add(q.id);

  return [...quizIds];
}

/** True when the student has a passed attempt for every quiz in the course. */
export async function studentPassedRequiredQuizzes(
  admin: SupabaseClient<Database>,
  studentId: string,
  courseId: string,
) {
  const quizIds = await courseQuizIds(admin, courseId);
  if (quizIds.length === 0) return true;

  for (const quizId of quizIds) {
    const { data: attempt } = await admin
      .from("quiz_attempts")
      .select("id")
      .eq("student_id", studentId)
      .eq("quiz_id", quizId)
      .eq("passed", true)
      .limit(1)
      .maybeSingle();
    if (!attempt) return false;
  }
  return true;
}

export async function clearIdleReminderForCourse(studentId: string, courseId: string) {
  const admin = createAdminClient();
  await admin
    .from("enrollments")
    .update({ idle_reminder_sent_at: null })
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .is("completed_at", null);
}

/**
 * Re-evaluate course completion after a lesson or quiz event.
 * Marks enrollment complete, issues certificate, and sends the completion email once.
 */
export async function evaluateAndCompleteCourse(studentId: string, courseId: string) {
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("title, required_completion_pct, certificate_enabled")
    .eq("id", courseId)
    .single();
  if (!course) return { completed: false as const };

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id, completed_at, completion_email_sent_at")
    .eq("student_id", studentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment || enrollment.completed_at) return { completed: false as const };

  const pct = await courseCompletionPct(studentId, courseId);
  if (pct < (course.required_completion_pct ?? 100)) {
    return { completed: false as const, coursePct: pct };
  }

  if (!(await studentPassedRequiredQuizzes(admin, studentId, courseId))) {
    return { completed: false as const, coursePct: pct, awaitingQuiz: true as const };
  }

  const completedAt = new Date().toISOString();
  await admin
    .from("enrollments")
    .update({ completed_at: completedAt })
    .eq("id", enrollment.id);

  await notify({
    studentId,
    type: "announcement",
    title: "Course complete",
    message: `You completed "${course.title}". Congratulations!`,
    linkUrl: "/courses",
  });

  if (course.certificate_enabled) {
    const cert = await issueCertificate({
      studentId,
      courseId,
      completedAt,
      sendEmail: false,
    });

    if (cert && !enrollment.completion_email_sent_at) {
      await sendCourseCompletionCertificateEmail({
        studentId,
        courseId,
        certificateId: cert.id,
        certificateNumber: cert.certificate_number,
      });
    }
  }

  await runAutomations("course_completed", { studentId, courseId });

  return { completed: true as const, coursePct: pct };
}

/** Courses with certificates disabled (no auto-issue / completion email). */
export async function coursesWithoutCertificateRule() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("courses")
    .select("id, title, visibility, certificate_enabled, required_completion_pct")
    .eq("certificate_enabled", false)
    .order("title");
  return data ?? [];
}
