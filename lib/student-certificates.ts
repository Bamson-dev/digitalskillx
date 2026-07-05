import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type StudentCertificateRow = {
  id: string;
  certificateNumber: string;
  issuedAt: string;
  isValid: boolean;
  courseTitle: string | null;
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

/** Load certificates for the signed-in student (service role after auth check). */
export async function getStudentCertificates(studentId: string): Promise<StudentCertificateRow[]> {
  await assertOwnStudentAccess(studentId);
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(createClient());

  const { data: certs, error } = await admin
    .from("certificates")
    .select("id, certificate_number, issued_at, is_valid, course_id")
    .eq("student_id", studentId)
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
  }));
}
