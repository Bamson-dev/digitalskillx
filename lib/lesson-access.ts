import "server-only";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { isMissingColumnError } from "@/lib/schema-guard";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Verify lesson access and return the canonical student id for progress writes. */
export async function resolveStudentLessonAccess(params: {
  authUserId: string;
  lessonId: string;
  profileEmail?: string | null;
}) {
  await bootstrapRuntimeSecrets();
  const session = createClient();
  const admin = await createAdminClientAsync(session);

  let targetStudentId = params.authUserId;
  try {
    targetStudentId = await syncStudentCourseAccess(admin, {
      authUserId: params.authUserId,
      profileEmail: params.profileEmail,
    });
  } catch (err) {
    console.error("[resolveStudentLessonAccess] sync failed; using auth user id", err);
  }

  const fullSelect = "id, is_free_preview, is_coming_soon, module:modules!inner(course_id)";
  const fallbackSelect = "id, is_free_preview, module:modules!inner(course_id)";

  let { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .select(fullSelect)
    .eq("id", params.lessonId)
    .maybeSingle();

  if (lessonError && isMissingColumnError(lessonError.message)) {
    console.error(
      "[resolveStudentLessonAccess] lessons.is_coming_soon missing — falling back; run sql/apply-production-stability.sql",
      lessonError.message,
    );
    const fallback = await admin
      .from("lessons")
      .select(fallbackSelect)
      .eq("id", params.lessonId)
      .maybeSingle();
    lesson = fallback.data
      ? ({ ...fallback.data, is_coming_soon: false } as typeof lesson)
      : null;
    lessonError = fallback.error;
  }

  if (lessonError) {
    console.error("[resolveStudentLessonAccess] lesson query failed", lessonError.message);
    return { ok: false as const, reason: "Lesson not found." };
  }

  if (!lesson) {
    return { ok: false as const, reason: "Lesson not found." };
  }

  const moduleRel = lesson.module as { course_id: string } | { course_id: string }[] | null;
  const courseId = Array.isArray(moduleRel) ? moduleRel[0]?.course_id : moduleRel?.course_id;
  if (!courseId) {
    return { ok: false as const, reason: "Course not found for this lesson." };
  }

  if (lesson.is_coming_soon) {
    return { ok: false as const, reason: "This lesson is not available yet." };
  }

  if (lesson.is_free_preview) {
    return { ok: true as const, studentId: targetStudentId, courseId };
  }

  const { data: enrollment } = await admin
    .from("enrollments")
    .select("id")
    .eq("student_id", targetStudentId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment) {
    return { ok: false as const, reason: "You are not enrolled in this course." };
  }

  return { ok: true as const, studentId: targetStudentId, courseId };
}
