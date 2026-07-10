import "server-only";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
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

  const targetStudentId = await syncStudentCourseAccess(admin, {
    authUserId: params.authUserId,
    profileEmail: params.profileEmail,
  });

  const { data: lesson, error: lessonError } = await admin
    .from("lessons")
    .select("id, is_free_preview, module:modules!inner(course_id)")
    .eq("id", params.lessonId)
    .maybeSingle();

  if (lessonError || !lesson) {
    return { ok: false as const, reason: "Lesson not found." };
  }

  const moduleRel = lesson.module as { course_id: string } | { course_id: string }[] | null;
  const courseId = Array.isArray(moduleRel) ? moduleRel[0]?.course_id : moduleRel?.course_id;
  if (!courseId) {
    return { ok: false as const, reason: "Course not found for this lesson." };
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
