import "server-only";
import { cookies } from "next/headers";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCourseProgressSummary } from "@/lib/progress";
import { isMissingColumnError } from "@/lib/schema-guard";
import {
  COURSE_CONTINUITY_COOKIE,
  readContinuityPayload,
} from "@/lib/course-continuity/token";

export type StudentCourseRow = {
  enrollmentId: string;
  courseId: string;
  enrolledAt: string;
  course: {
    id: string;
    title: string;
    description: string | null;
    short_description: string | null;
    thumbnail_url: string | null;
    price_ngn: number;
    price_usd: number;
    instructor_name?: string | null;
    is_coming_soon?: boolean;
  } | null;
};

async function continuityAllowsCourse(studentId: string, courseId: string) {
  try {
    const payload = await readContinuityPayload(
      cookies().get(COURSE_CONTINUITY_COOKIE)?.value,
    );
    if (!payload || payload.sub !== studentId) return false;
    // Only courses previously stamped onto the continuity cookie.
    return payload.courses.includes(courseId);
  } catch {
    return false;
  }
}

async function assertOwnStudentAccess(studentId: string) {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    if (user.id !== studentId) throw new Error("Forbidden.");
    return;
  }
  const payload = await readContinuityPayload(
    cookies().get(COURSE_CONTINUITY_COOKIE)?.value,
  );
  if (payload?.sub === studentId) return;
  throw new Error("Not authenticated.");
}

async function safeSyncStudentAccess(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  studentId: string,
  profileEmail?: string | null,
) {
  try {
    return await syncStudentCourseAccess(admin, {
      authUserId: studentId,
      profileEmail,
    });
  } catch (err) {
    console.error("[checkStudentCourseEnrollment] sync failed; using auth user id", err);
    return studentId;
  }
}

/** Sync orphan enrollments, then check access to one course (service role after auth check). */
export async function checkStudentCourseEnrollment(
  studentId: string,
  courseId: string,
): Promise<{ enrolled: boolean; enrollmentId: string | null; targetStudentId: string }> {
  await assertOwnStudentAccess(studentId);

  try {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(createClient());

    const { data: profile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", studentId)
      .maybeSingle();

    const targetStudentId = await safeSyncStudentAccess(admin, studentId, profile?.email);

    const { data: enrollment } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", targetStudentId)
      .eq("course_id", courseId)
      .maybeSingle();

    if (enrollment) {
      return {
        enrolled: true,
        enrollmentId: enrollment.id,
        targetStudentId,
      };
    }
  } catch (err) {
    console.error("[checkStudentCourseEnrollment] db unavailable:", err);
  }

  if (await continuityAllowsCourse(studentId, courseId)) {
    return {
      enrolled: true,
      enrollmentId: null,
      targetStudentId: studentId,
    };
  }

  return {
    enrolled: false,
    enrollmentId: null,
    targetStudentId: studentId,
  };
}

/** Load enrolled courses for the signed-in student (service role after auth check). */
export async function getStudentEnrolledCourses(studentId: string): Promise<StudentCourseRow[]> {
  await assertOwnStudentAccess(studentId);
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(createClient());

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", studentId)
    .maybeSingle();

  const targetStudentId = await safeSyncStudentAccess(admin, studentId, profile?.email);

  const { data: enrollments, error: enrollError } = await admin
    .from("enrollments")
    .select("id, course_id, enrolled_at")
    .eq("student_id", targetStudentId)
    .order("enrolled_at", { ascending: false });

  if (enrollError) throw new Error(enrollError.message);
  if (!enrollments?.length) return [];

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  let { data: courses, error: courseError } = await admin
    .from("courses")
    .select(
      "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon",
    )
    .in("id", courseIds);

  if (courseError && isMissingColumnError(courseError.message)) {
    console.error("[getStudentEnrolledCourses] is_coming_soon missing; falling back", courseError.message);
    const fallback = await admin
      .from("courses")
      .select(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name",
      )
      .in("id", courseIds);
    courses = (fallback.data ?? []).map((c) => ({ ...c, is_coming_soon: false }));
    courseError = fallback.error;
  }

  if (courseError) throw new Error(courseError.message);

  const courseById = new Map((courses ?? []).map((course) => [course.id, course]));

  return enrollments.map((row) => ({
    enrollmentId: row.id,
    courseId: row.course_id,
    enrolledAt: row.enrolled_at,
    course: courseById.get(row.course_id) ?? null,
  }));
}

export async function getStudentEnrolledCoursesWithProgress(studentId: string) {
  const rows = await getStudentEnrolledCourses(studentId);
  return Promise.all(
    rows.map(async (row) => {
      if (!row.course) {
        return { ...row, pct: 0, totalLessons: 0, lessonsLeft: 0 };
      }
      const summary = await getCourseProgressSummary(studentId, row.course.id);
      return { ...row, ...summary };
    }),
  );
}
