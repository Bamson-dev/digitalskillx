import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  reconcileOrphanCertificatesForEmail,
  resolveCanonicalStudentId,
} from "@/lib/admin-student-onboarding";
import { notify } from "@/lib/notifications";
import { sendCertificateIssuedEmail } from "@/lib/system-email-triggers";
import { resolveCertificateTemplateKey } from "@/lib/certificate-template-resolve";
import type { Certificate } from "@/types/database";

/** Generate a unique, human-readable certificate number, e.g. PDG-7F3A9C2B. */
export function generateCertificateNumber() {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 10);
  return `PDG-${rand}`;
}

export function certificateRecipientName(params: {
  recipientName?: string | null;
  profileFullName?: string | null;
  email?: string | null;
}) {
  const fromCert = params.recipientName?.trim();
  if (fromCert) return fromCert;
  const fromProfile = params.profileFullName?.trim();
  if (fromProfile) return fromProfile;
  return params.email?.split("@")[0] ?? "Student";
}

async function emailCertificate(params: {
  studentId: string;
  courseId: string;
  certificateId: string;
  certificateNumber: string;
  recipientName: string;
  email: string;
  courseTitle: string;
  issuedAt: string;
}) {
  return sendCertificateIssuedEmail({
    studentId: params.studentId,
    courseId: params.courseId,
    certificateId: params.certificateId,
    certificateNumber: params.certificateNumber,
    fullName: params.recipientName,
    email: params.email,
    courseTitle: params.courseTitle,
    issuedAt: params.issuedAt,
  });
}

/**
 * Issue a certificate for a student+course (idempotent). Sends email with PDF
 * attachment and in-app notification when sendEmail is true (default).
 */
export async function issueCertificate(params: {
  studentId: string;
  courseId: string;
  completedAt?: string;
  recipientName?: string;
  sendEmail?: boolean;
}): Promise<Certificate | null> {
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

  const recipientName = certificateRecipientName({
    recipientName: params.recipientName,
    profileFullName: profile.full_name,
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
  const courseTitle = course?.title ?? "your course";

  if (existing) {
    const nameOnCert = certificateRecipientName({
      recipientName: existing.recipient_name ?? params.recipientName,
      profileFullName: profile.full_name,
      email: profile.email,
    });

    if (params.recipientName?.trim() && params.recipientName.trim() !== existing.recipient_name) {
      await admin
        .from("certificates")
        .update({ recipient_name: params.recipientName.trim() })
        .eq("id", existing.id);
    } else if (!existing.recipient_name) {
      await admin.from("certificates").update({ recipient_name: nameOnCert }).eq("id", existing.id);
    }

    if (shouldSendEmail) {
      await emailCertificate({
        studentId: canonicalStudentId,
        courseId: params.courseId,
        certificateId: existing.id,
        certificateNumber: existing.certificate_number,
        recipientName: params.recipientName?.trim() || nameOnCert,
        email: profile.email,
        courseTitle,
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
      recipient_name: recipientName,
    })
    .select("*")
    .single();
  if (error || !cert) return null;

  await notify({
    studentId: canonicalStudentId,
    type: "certificate_issued",
    title: "Certificate issued",
    message: `Your certificate for "${courseTitle}" is ready.`,
    linkUrl: `/certificates/${cert.id}`,
  });

  if (shouldSendEmail) {
    await emailCertificate({
      studentId: canonicalStudentId,
      courseId: params.courseId,
      certificateId: cert.id,
      certificateNumber: cert.certificate_number,
      recipientName,
      email: profile.email,
      courseTitle,
      issuedAt: cert.issued_at,
    });
  }

  return cert;
}

/** Update the printed name on a certificate without resending email. */
export async function updateCertificateRecipientName(params: {
  certificateId: string;
  recipientName: string;
}) {
  const admin = await createAdminClientAsync();
  const name = params.recipientName.trim();
  if (!name) throw new Error("Recipient name is required.");

  const { data: cert, error } = await admin
    .from("certificates")
    .update({ recipient_name: name })
    .eq("id", params.certificateId)
    .select("id, student_id, course_id")
    .single();

  if (error) throw new Error(error.message);
  if (!cert) throw new Error("Certificate not found.");
  return cert;
}

/** Resend certificate email with PDF; optionally update the printed name first. */
export async function reissueCertificate(params: {
  certificateId: string;
  recipientName?: string;
}) {
  const admin = await createAdminClientAsync();

  const { data: cert } = await admin
    .from("certificates")
    .select("id, student_id, course_id, certificate_number, issued_at, recipient_name, is_valid")
    .eq("id", params.certificateId)
    .maybeSingle();

  if (!cert) throw new Error("Certificate not found.");
  if (!cert.is_valid) throw new Error("This certificate is no longer valid.");

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", cert.student_id)
    .maybeSingle();
  if (!profile?.email) throw new Error("Student profile not found.");

  const { data: course } = await admin
    .from("courses")
    .select("title")
    .eq("id", cert.course_id)
    .maybeSingle();

  const recipientName = certificateRecipientName({
    recipientName: params.recipientName ?? cert.recipient_name,
    profileFullName: profile.full_name,
    email: profile.email,
  });

  if (recipientName !== cert.recipient_name) {
    await admin.from("certificates").update({ recipient_name: recipientName }).eq("id", cert.id);
  }

  const emailResult = await emailCertificate({
    studentId: cert.student_id,
    courseId: cert.course_id,
    certificateId: cert.id,
    certificateNumber: cert.certificate_number,
    recipientName,
    email: profile.email,
    courseTitle: course?.title ?? "your course",
    issuedAt: cert.issued_at,
  });

  return { recipientName, emailResult };
}
