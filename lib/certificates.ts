import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  reconcileOrphanCertificatesForEmail,
  resolveCanonicalStudentId,
} from "@/lib/admin-student-onboarding";
import { notify } from "@/lib/notifications";
import { sendCertificateIssuedEmail } from "@/lib/system-email-triggers";
import { resolveCertificateTemplateKey } from "@/lib/certificate-template-resolve";

/** Generate a unique, human-readable certificate number, e.g. PDG-7F3A9C2B. */
export function generateCertificateNumber() {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 10);
  return `PDG-${rand}`;
}

/**
 * Issue a certificate for a student+course (idempotent). Sends email with PDF
 * attachment and in-app notification when sendEmail is true (default).
 */
export async function issueCertificate(params: {
  studentId: string;
  courseId: string;
  completedAt?: string;
  sendEmail?: boolean;
}) {
  const admin = await createAdminClientAsync();

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", params.studentId)
    .maybeSingle();

  if (!profile?.email) return null;

  const canonicalStudentId = await resolveCanonicalStudentId(admin, {
    studentId: params.studentId,
    email: profile.email,
  });
  await reconcileOrphanCertificatesForEmail(admin, {
    authUserId: canonicalStudentId,
    email: profile.email,
  });

  const { data: existing } = await admin
    .from("certificates")
    .select("*")
    .eq("student_id", canonicalStudentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  const { data: course } = await admin
    .from("courses")
    .select("title")
    .eq("id", params.courseId)
    .maybeSingle();

  const shouldSendEmail = params.sendEmail !== false;

  if (existing) {
    if (shouldSendEmail) {
      await sendCertificateIssuedEmail({
        studentId: canonicalStudentId,
        courseId: params.courseId,
        certificateId: existing.id,
        certificateNumber: existing.certificate_number,
        fullName: profile.full_name ?? profile.email.split("@")[0],
        email: profile.email,
        courseTitle: course?.title ?? "your course",
        issuedAt: existing.issued_at,
      });
    }
    return existing;
  }

  const templateKey = await resolveCertificateTemplateKey(admin, params.courseId);

  const { data: cert, error } = await admin
    .from("certificates")
    .insert({
      student_id: canonicalStudentId,
      course_id: params.courseId,
      certificate_number: generateCertificateNumber(),
      completed_at: params.completedAt ?? new Date().toISOString(),
      is_valid: true,
      template_key: templateKey,
    })
    .select("*")
    .single();
  if (error || !cert) return null;

  await notify({
    studentId: canonicalStudentId,
    type: "certificate_issued",
    title: "Certificate issued",
    message: `Your certificate for "${course?.title ?? "your course"}" is ready.`,
    linkUrl: `/certificates/${cert.id}`,
  });

  if (shouldSendEmail) {
    await sendCertificateIssuedEmail({
      studentId: canonicalStudentId,
      courseId: params.courseId,
      certificateId: cert.id,
      certificateNumber: cert.certificate_number,
      fullName: profile.full_name ?? profile.email.split("@")[0],
      email: profile.email,
      courseTitle: course?.title ?? "your course",
      issuedAt: cert.issued_at,
    });
  }

  return cert;
}
