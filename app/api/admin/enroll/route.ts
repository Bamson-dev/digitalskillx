import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  grantCourseAccessToStudent,
  verifyStudentCourseAccess,
  resolveCanonicalStudentId,
} from "@/lib/admin-student-onboarding";

export const dynamic = "force-dynamic";

/** Manual enrollment JSON API — used by admin tools and regression certification. */
export async function POST(request: NextRequest) {
  const limited = await rateLimitedResponse(request, "admin-enroll", 60);
  if (limited) return limited;

  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;

  let body: { studentId?: string; courseId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const studentId = String(body.studentId ?? "").trim();
  const courseId = String(body.courseId ?? "").trim();
  if (!studentId || !courseId) {
    return NextResponse.json({ error: "studentId and courseId are required." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await auth.admin
    .from("profiles")
    .select("id, email, full_name, role, is_suspended")
    .eq("id", studentId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }
  if (!profile || profile.role !== "student") {
    return NextResponse.json({ error: "Student not found." }, { status: 404 });
  }
  if (profile.is_suspended) {
    return NextResponse.json({ error: "Student account is suspended." }, { status: 403 });
  }

  const { newlyEnrolled } = await grantCourseAccessToStudent(auth.admin, {
    studentId,
    courseIds: [courseId],
    enrolledBy: auth.user.id,
    fullName: profile.full_name ?? "there",
    email: profile.email,
  });

  const canonicalStudentId = await resolveCanonicalStudentId(auth.admin, {
    studentId,
    email: profile.email,
  });
  const { enrolledCourseIds } = await verifyStudentCourseAccess(auth.admin, canonicalStudentId, [
    courseId,
  ]);
  if (enrolledCourseIds.length === 0) {
    return NextResponse.json({ error: "Enrollment did not save." }, { status: 500 });
  }

  await logAudit({
    action: "student_enrolled",
    targetType: "enrollment",
    metadata: { studentId, courseId, via: "api" },
  });
  revalidatePath(`/admin/students/${studentId}`);
  revalidatePath("/admin/students");

  return NextResponse.json({
    enrolled: true,
    newlyEnrolled: newlyEnrolled.length > 0,
    studentId: canonicalStudentId,
    courseId,
  });
}
