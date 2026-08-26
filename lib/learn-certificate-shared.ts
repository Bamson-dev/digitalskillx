/** Pure Stage 8 certificate-offer helpers (no secrets, no I/O). */

import { isCertificateTemplateKey } from "./certificate-templates";
import {
  LEARN_CERTIFICATE_PRICE_TIERS,
  resolveFinalCertificatePrice,
  type LearnCertificatePricingMode,
} from "./learn-certificate-pricing";

export const PATH_CERTIFICATE_ATTRIBUTION =
  "Lessons embed original YouTube videos. DigitalSkillX organizes public educational content into a learning path and does not claim a partnership with the creator.";

export type CertificateOfferPatch = {
  certificate_enabled: boolean;
  certificate_price_ngn: number | null;
  certificate_pricing_mode: LearnCertificatePricingMode;
  certificate_recommended_price_ngn?: number | null;
  recommended_course_id: string | null;
  certificate_template_override: string | null;
};

export type PublishedCourseOption = {
  id: string;
  title: string;
  price_ngn: number;
  visibility: string;
};

export type LearningPathCertificateRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  certificate_enabled: boolean;
  certificate_price_ngn: number | null;
  certificate_pricing_mode: LearnCertificatePricingMode;
  certificate_recommended_price_ngn: number | null;
  certificate_price_reason: string | null;
  recommended_course_id: string | null;
  recommended_course_title: string | null;
  certificate_template_override: string | null;
  certificates_issued: number;
  artwork_status?: string | null;
  artwork_source?: string | null;
  artwork_public_url?: string | null;
  artwork_error?: string | null;
};

export type LearningPathCertificateMetrics = {
  certificatesIssued: number;
  certificateRevenueNgn: number;
  averageCertificateValueNgn: number;
  recent: {
    id: string;
    certificate_number: string;
    issued_at: string;
    learning_path_title: string;
  }[];
};

export type CertificateSubjectKind = "course" | "learning_path";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function isUniqueViolation(message: string | null | undefined) {
  if (!message) return false;
  return /duplicate key|unique constraint|certificates_student_learning_path/i.test(message);
}

export function parseCertificateOfferPatch(
  input: unknown,
): { ok: true; value: CertificateOfferPatch } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Certificate offer is required." };
  }
  const body = input as Record<string, unknown>;
  const certificate_enabled = body.certificate_enabled === true;

  let certificate_pricing_mode: LearnCertificatePricingMode = "automatic";
  if (typeof body.certificate_pricing_mode === "string") {
    const mode = body.certificate_pricing_mode.trim().toLowerCase();
    if (mode === "automatic" || mode === "fixed" || mode === "free") {
      certificate_pricing_mode = mode;
    } else {
      return { ok: false, error: "Pricing mode must be automatic, fixed, or free." };
    }
  }

  let certificate_price_ngn: number | null = null;
  if (body.certificate_price_ngn === null || body.certificate_price_ngn === "") {
    certificate_price_ngn = null;
  } else if (typeof body.certificate_price_ngn === "number" && Number.isFinite(body.certificate_price_ngn)) {
    certificate_price_ngn = Math.round(body.certificate_price_ngn);
  } else if (typeof body.certificate_price_ngn === "string" && body.certificate_price_ngn.trim()) {
    const parsed = Number(body.certificate_price_ngn);
    if (!Number.isFinite(parsed)) return { ok: false, error: "Certificate price must be a whole NGN amount." };
    certificate_price_ngn = Math.round(parsed);
  }
  if (certificate_price_ngn != null && certificate_price_ngn < 0) {
    return { ok: false, error: "Certificate price cannot be negative." };
  }

  if (certificate_enabled) {
    if (certificate_pricing_mode === "free") {
      certificate_price_ngn = 0;
    } else if (certificate_price_ngn == null || certificate_price_ngn <= 0) {
      return { ok: false, error: "Enable a certificate only when a price greater than 0 NGN is set." };
    } else if (certificate_pricing_mode === "fixed") {
      if (
        !LEARN_CERTIFICATE_PRICE_TIERS.includes(
          certificate_price_ngn as (typeof LEARN_CERTIFICATE_PRICE_TIERS)[number],
        )
      ) {
        return {
          ok: false,
          error: "Fixed certificate price must be one of ₦2,000, ₦3,000, ₦5,000, or ₦7,500.",
        };
      }
    } else {
      // automatic: snap messy amounts to approved tiers
      certificate_price_ngn = resolveFinalCertificatePrice({
        mode: "automatic",
        recommendedPriceNgn: certificate_price_ngn,
        fixedPriceNgn: certificate_price_ngn,
      });
      if (!(certificate_price_ngn > 0)) {
        return { ok: false, error: "Enable a certificate only when a price greater than 0 NGN is set." };
      }
    }
  }

  let recommended_course_id: string | null = null;
  if (typeof body.recommended_course_id === "string" && body.recommended_course_id.trim()) {
    const id = body.recommended_course_id.trim();
    if (!isUuid(id)) return { ok: false, error: "Recommended course is invalid." };
    recommended_course_id = id;
  }

  let certificate_template_override: string | null = null;
  if (typeof body.certificate_template_override === "string" && body.certificate_template_override.trim()) {
    const key = body.certificate_template_override.trim();
    if (!isCertificateTemplateKey(key)) {
      return { ok: false, error: "Certificate template override is invalid." };
    }
    certificate_template_override = key;
  }

  return {
    ok: true,
    value: {
      certificate_enabled,
      certificate_price_ngn,
      certificate_pricing_mode,
      recommended_course_id,
      certificate_template_override,
    },
  };
}

export function recommendedCourseIsSelectable(params: {
  courseId: string | null;
  publishedCourseIds: string[];
}) {
  if (!params.courseId) return true;
  return params.publishedCourseIds.includes(params.courseId);
}

export function learningPathCertificateShareText(pathTitle: string) {
  return `I completed the DigitalSkillX learning path ${pathTitle}. Verify my certificate:`;
}
