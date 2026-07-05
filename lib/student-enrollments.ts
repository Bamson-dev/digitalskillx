import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { syncStudentCourseAccess } from "@/lib/admin-student-onboarding";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { courseCompletionPct } from "@/lib/progress";

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
  } | null;
};

async function assertOwnStudentAccess(studentId: string) {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  if (user.id !== studentId) throw new Error("Forbidden.");
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

  const targetStudentId = await syncStudentCourseAccess(admin, {
    authUserId: studentId,
    profileEmail: profile?.email,
  });

  const { data: enrollments, error: enrollError } = await admin
    .from("enrollments")
    .select("id, course_id, enrolled_at")
    .eq("student_id", targetStudentId)
    .order("enrolled_at", { ascending: false });

  if (enrollError) throw new Error(enrollError.message);
  if (!enrollments?.length) return [];

  const courseIds = [...new Set(enrollments.map((row) => row.course_id))];
  const { data: courses, error: courseError } = await admin
    .from("courses")
    .select("id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name")
    .in("id", courseIds);

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
    rows.map(async (row) => ({
      ...row,
      pct: row.course ? await courseCompletionPct(studentId, row.course.id) : 0,
    })),
  );
}
