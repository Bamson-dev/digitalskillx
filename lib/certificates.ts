import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveCertificateTemplateKey } from "@/lib/certificate-template-resolve";
import { notify } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email/templates";

function siteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://digitalskillx.com").replace(
    /\/$/,
    "",
  );
}

/** Generate a unique, human-readable certificate number, e.g. PDG-7F3A9C2B. */
export function generateCertificateNumber() {
  const rand = Math.random().toString(36).toUpperCase().slice(2, 10);
  return `PDG-${rand}`;
}

/**
 * Issue a certificate for a student+course (idempotent). Sends the
 * "certificate ready" email + in-app notification (PRD §11.4).
 */
export async function issueCertificate(params: {
  studentId: string;
  courseId: string;
  completedAt?: string;
  sendEmail?: boolean;
}) {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("certificates")
    .select("*")
    .eq("student_id", params.studentId)
    .eq("course_id", params.courseId)
    .maybeSingle();

  if (existing) return existing;

  const templateKey = await resolveCertificateTemplateKey(supabase, params.courseId);

  const { data: cert, error } = await supabase
    .from("certificates")
    .insert({
      student_id: params.studentId,
      course_id: params.courseId,
      certificate_number: generateCertificateNumber(),
      completed_at: params.completedAt ?? new Date().toISOString(),
      is_valid: true,
      template_key: templateKey,
    })
    .select("*")
    .single();
  if (error || !cert) return null;

  const [{ data: profile }, { data: course }] = await Promise.all([
    supabase.from("profiles").select("full_name, email").eq("id", params.studentId).single(),
    supabase.from("courses").select("title").eq("id", params.courseId).single(),
  ]);

  await notify({
    studentId: params.studentId,
    type: "certificate_issued",
    title: "Certificate issued",
    message: `Your certificate for "${course?.title ?? "your course"}" is ready.`,
    linkUrl: "/certificates",
  });

  if (profile?.email && params.sendEmail) {
    const tpl = emailTemplates.certificateReady({
      name: profile.full_name ?? "there",
      courseTitle: course?.title ?? "your course",
      url: `${siteUrl()}/certificates`,
    });
    await sendEmail({ to: profile.email, subject: tpl.subject, html: tpl.html });
  }

  return cert;
}
