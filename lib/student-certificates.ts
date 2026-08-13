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
  courseId: string | null;
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

  const withPath =
    "id, certificate_number, issued_at, is_valid, course_id, learning_path_id, recipient_name";
  const base = "id, certificate_number, issued_at, is_valid, course_id, recipient_name";
  const pathQuery = await admin.from("certificates").select(withPath).eq("student_id", targetStudentId).order("issued_at", { ascending: false });
  const certQuery =
    pathQuery.error && /learning_path_id|does not exist|could not find/i.test(pathQuery.error.message)
      ? await admin.from("certificates").select(base).eq("student_id", targetStudentId).order("issued_at", { ascending: false })
      : pathQuery;
  if (certQuery.error) throw new Error(certQuery.error.message);
  const certs = (certQuery.data ?? []) as Array<{
    id: string;
    certificate_number: string;
    issued_at: string;
    is_valid: boolean;
    course_id: string | null;
    learning_path_id?: string | null;
    recipient_name: string | null;
  }>;
  if (!certs.length) return [];

  const courseIds = [...new Set(certs.map((row) => row.course_id).filter((id): id is string => Boolean(id)))];
  const pathIds = [...new Set(certs.map((row) => row.learning_path_id).filter((id): id is string => Boolean(id)))];
  const [{ data: courses }, { data: paths }] = await Promise.all([
    courseIds.length
      ? admin.from("courses").select("id, title").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    pathIds.length
      ? admin.from("learning_paths").select("id, title").in("id", pathIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const titleById = new Map((courses ?? []).map((course) => [course.id, course.title]));
  const pathTitleById = new Map((paths ?? []).map((row) => [row.id, row.title]));

  return certs.map((row) => ({
    id: row.id,
    certificateNumber: row.certificate_number,
    issuedAt: row.issued_at,
    isValid: row.is_valid,
    courseId: row.course_id,
    courseTitle:
      (row.course_id ? titleById.get(row.course_id) : null) ??
      (row.learning_path_id ? pathTitleById.get(row.learning_path_id) : null) ??
      null,
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

  const withPath =
    "id, certificate_number, issued_at, completed_at, template_key, recipient_name, student_id, course:courses(title), learning_path:learning_paths(title)";
  const base =
    "id, certificate_number, issued_at, completed_at, template_key, recipient_name, student_id, course:courses(title)";
  const pathDetail = await admin.from("certificates").select(withPath).eq("id", certificateId).maybeSingle();
  const certQuery =
    pathDetail.error && /learning_path|does not exist|could not find/i.test(pathDetail.error.message)
      ? await admin.from("certificates").select(base).eq("id", certificateId).maybeSingle()
      : pathDetail;
  if (certQuery.error) throw new Error(certQuery.error.message);
  const cert = certQuery.data as
    | {
        id: string;
        certificate_number: string;
        issued_at: string;
        completed_at: string | null;
        template_key: string | null;
        recipient_name: string | null;
        student_id: string;
        course: { title: string } | { title: string }[] | null;
        learning_path?: { title: string } | { title: string }[] | null;
      }
    | null;
  if (!cert || cert.student_id !== targetStudentId) return null;

  const course = Array.isArray(cert.course) ? cert.course[0] : cert.course;
  const path = Array.isArray(cert.learning_path) ? cert.learning_path[0] : cert.learning_path;

  return {
    id: cert.id,
    certificateNumber: cert.certificate_number,
    issuedAt: cert.issued_at,
    completedAt: cert.completed_at,
    templateKey: cert.template_key,
    recipientName: displayNameFrom(cert.recipient_name, profile?.full_name, profile?.email),
    courseTitle: course?.title || path?.title || "Certificate",
  };
}
