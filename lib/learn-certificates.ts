import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Certificate, Database, Json } from "@/types/database";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  certificateRecipientName,
  generateCertificateNumber,
} from "@/lib/certificates";
import {
  reconcileOrphanCertificatesForEmail,
  resolveCanonicalStudentId,
} from "@/lib/admin-student-onboarding";
import { notify } from "@/lib/notifications";
import { sendCertificateIssuedEmail } from "@/lib/system-email-triggers";
import { DEFAULT_CERTIFICATE_TEMPLATE_KEY, normalizeCertificateTemplateKey } from "@/lib/certificate-templates";
import { isMissingColumnError } from "@/lib/schema-guard";
import { pathCertificateOfferable } from "@/lib/content-factory/library-shared";
import { isUniqueViolation } from "@/lib/learn-certificate-shared";

type Admin = SupabaseClient<Database>;

export function readLearningPathIdFromPaystackData(paystackData: unknown): string | null {
  if (!paystackData || typeof paystackData !== "object") return null;
  const bag = paystackData as Record<string, unknown>;
  if (typeof bag.learning_path_id === "string" && bag.learning_path_id) return bag.learning_path_id;
  const commerce = bag.commerce;
  if (commerce && typeof commerce === "object") {
    const c = commerce as Record<string, unknown>;
    if (typeof c.learning_path_id === "string" && c.learning_path_id) return c.learning_path_id;
  }
  return null;
}

export async function loadPublishedPathCertificateOffer(admin: Admin, pathId: string) {
  const { data, error } = await admin
    .from("learning_paths")
    .select("id, slug, title, status, certificate_enabled, certificate_price_ngn, certificate_template_override")
    .eq("id", pathId)
    .maybeSingle();
  if (error) {
    if (isMissingColumnError(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data || !pathCertificateOfferable(data)) return null;
  return data;
}

export async function issueLearningPathCertificate(params: {
  studentId: string;
  learningPathId: string;
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

  const { data: path, error: pathError } = await admin
    .from("learning_paths")
    .select("id, title, status, certificate_template_override, creator_profile_id")
    .eq("id", params.learningPathId)
    .maybeSingle();
  if (pathError) {
    if (isMissingColumnError(pathError.message)) return null;
    throw new Error(pathError.message);
  }
  if (!path || path.status !== "published") return null;

  const recipientName = certificateRecipientName({
    recipientName: params.recipientName,
    profileFullName: profile.full_name,
    email: profile.email,
  });

  const { data: existing, error: existingError } = await admin
    .from("certificates")
    .select("*")
    .eq("student_id", canonicalStudentId)
    .eq("learning_path_id", params.learningPathId)
    .maybeSingle();
  if (existingError && !isMissingColumnError(existingError.message)) {
    throw new Error(existingError.message);
  }
  if (existing) return existing;

  const templateKey =
    normalizeCertificateTemplateKey(path.certificate_template_override) ?? DEFAULT_CERTIFICATE_TEMPLATE_KEY;

  const { data: cert, error } = await admin
    .from("certificates")
    .insert({
      student_id: canonicalStudentId,
      course_id: null,
      learning_path_id: params.learningPathId,
      certificate_number: generateCertificateNumber(),
      completed_at: params.completedAt ?? new Date().toISOString(),
      is_valid: true,
      template_key: templateKey,
      recipient_name: recipientName,
    })
    .select("*")
    .single();
  if (error || !cert) {
    if (error && isUniqueViolation(error.message)) {
      const { data: raced } = await admin
        .from("certificates")
        .select("*")
        .eq("student_id", canonicalStudentId)
        .eq("learning_path_id", params.learningPathId)
        .maybeSingle();
      return raced ?? null;
    }
    return null;
  }

  await notify({
    studentId: canonicalStudentId,
    type: "certificate_issued",
    title: "Certificate issued",
    message: `Your certificate for "${path.title}" is ready.`,
    linkUrl: `/certificates/${cert.id}`,
  });

  if (params.sendEmail !== false) {
    let creatorName: string | null = null;
    if (path.creator_profile_id) {
      const { data: creator } = await admin
        .from("creator_profiles")
        .select("display_name")
        .eq("id", path.creator_profile_id)
        .maybeSingle();
      creatorName = creator?.display_name ?? null;
    }
    await sendCertificateIssuedEmail({
      studentId: canonicalStudentId,
      courseId: params.learningPathId,
      certificateId: cert.id,
      certificateNumber: cert.certificate_number,
      fullName: recipientName,
      email: profile.email,
      courseTitle: path.title,
      issuedAt: cert.issued_at,
      kind: "learning_path",
      creatorName,
    });
  }

  return cert;
}

export async function fulfillLearningPathCertificatePurchase(params: {
  admin: Admin;
  studentId: string;
  reference: string;
  learningPathId: string;
  buyerName?: string;
}) {
  const { data: claimed, error: claimError } = await params.admin
    .from("transactions")
    .update({ status: "success" })
    .eq("reference", params.reference)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError && !isMissingColumnError(claimError.message)) {
    throw new Error(claimError.message);
  }

  const cert = await issueLearningPathCertificate({
    studentId: params.studentId,
    learningPathId: params.learningPathId,
    recipientName: params.buyerName,
  });

  return {
    fulfilled: Boolean(cert),
    alreadyFulfilled: !claimed,
    certificateId: cert?.id ?? null,
    certificateNumber: cert?.certificate_number ?? null,
  };
}

export function buildLearningPathCheckoutPayload(params: {
  checkoutEmail?: string;
  checkoutName?: string;
  learningPathId: string;
}): Json {
  return {
    learning_path_id: params.learningPathId,
    commerce: { kind: "learning_path_certificate", learning_path_id: params.learningPathId },
    ...(params.checkoutEmail ? { checkout_email: params.checkoutEmail } : {}),
    ...(params.checkoutName ? { checkout_full_name: params.checkoutName } : {}),
  };
}
