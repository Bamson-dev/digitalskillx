import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import {
  reconcileOrphanCertificatesForEmail,
  syncStudentCourseAccess,
} from "@/lib/admin-student-onboarding";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StudentCertificateRow = {
  id: string;
  certificateNumber: string;
  issuedAt: string;
  isValid: boolean;
  courseTitle: string | null;
  recipientName: string;
};

export type StudentCertificateDetail = {
  id: string;
  certificateNumber: string;
  issuedAt: string;
  completedAt: string | null;
  templateKey: string | null;
  recipientName: string;
  courseTitle: string;
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

async function resolveTargetStudentId(studentId: string) {
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(createClient());

  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", studentId)
    .maybeSingle();

  const targetStudentId = await syncStudentCourseAccess(admin, {
    authUserId: studentId,
    profileEmail: profile?.email,
  });

  if (profile?.email) {
    await reconcileOrphanCertificatesForEmail(admin, {
      authUserId: targetStudentId,
      email: profile.email.trim().toLowerCase(),
    });
  }

  return { admin, targetStudentId, profile };
}

function displayNameFrom(
  recipientName: string | null | undefined,
  profileName: string | null | undefined,
  email: string | null | undefined,
) {
  const trimmed = recipientName?.trim();
  if (trimmed) return trimmed;
  const fromProfile = profileName?.trim();
  if (fromProfile) return fromProfile;
  return email?.split("@")[0] ?? "Student";
}

/** Load certificates for the signed-in student (service role after auth check). */
export async function getStudentCertificates(studentId: string): Promise<StudentCertificateRow[]> {
  await assertOwnStudentAccess(studentId);
  const { admin, targetStudentId, profile } = await resolveTargetStudentId(studentId);

  const { data: certs, error } = await admin
    .from("certificates")
    .select("id, certificate_number, issued_at, is_valid, course_id, recipient_name")
    .eq("student_id", targetStudentId)
    .order("issued_at", { ascending: false });

  if (error) throw new Error(error.message);
  if (!certs?.length) return [];

  const courseIds = [...new Set(certs.map((row) => row.course_id))];
  const { data: courses } = await admin.from("courses").select("id, title").in("id", courseIds);
  const titleById = new Map((courses ?? []).map((course) => [course.id, course.title]));

  return certs.map((row) => ({
    id: row.id,
    certificateNumber: row.certificate_number,
    issuedAt: row.issued_at,
    isValid: row.is_valid,
    courseTitle: titleById.get(row.course_id) ?? null,
    recipientName: displayNameFrom(row.recipient_name, profile?.full_name, profile?.email),
  }));
}

/** Load one certificate for the signed-in student after ID sync. */
export async function getStudentCertificateById(
  studentId: string,
  certificateId: string,
): Promise<StudentCertificateDetail | null> {
  await assertOwnStudentAccess(studentId);
  const { admin, targetStudentId, profile } = await resolveTargetStudentId(studentId);

  const { data: cert, error } = await admin
    .from("certificates")
    .select(
      "id, certificate_number, issued_at, completed_at, template_key, recipient_name, student_id, course:courses(title)",
    )
    .eq("id", certificateId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!cert || cert.student_id !== targetStudentId) return null;

  const course = Array.isArray(cert.course) ? cert.course[0] : cert.course;

  return {
    id: cert.id,
    certificateNumber: cert.certificate_number,
    issuedAt: cert.issued_at,
    completedAt: cert.completed_at,
    templateKey: cert.template_key,
    recipientName: displayNameFrom(cert.recipient_name, profile?.full_name, profile?.email),
    courseTitle: course?.title ?? "Course",
  };
}
