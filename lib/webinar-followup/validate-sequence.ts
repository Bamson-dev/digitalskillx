import type { SequenceEmailContent } from "./render";
import {
  WEBINAR_FOLLOWUP_ALLOWED_CTA_URLS,
  WEBINAR_FOLLOWUP_REQUIRED_STEPS,
} from "./constants";

export type SequenceValidationIssue = {
  code: string;
  message: string;
  stepNumber?: number;
};

export type SequenceValidationResult =
  | { ok: true; emails: SequenceEmailContent[] }
  | { ok: false; issues: SequenceValidationIssue[] };

/**
 * Validates a webinar follow-up sequence for seed / activation gates.
 * Requires exactly WEBINAR_FOLLOWUP_REQUIRED_STEPS ordered steps with required fields.
 */
export function validateWebinarSequence(
  emails: SequenceEmailContent[],
  expectedLength = WEBINAR_FOLLOWUP_REQUIRED_STEPS,
): SequenceValidationResult {
  const issues: SequenceValidationIssue[] = [];

  if (!Array.isArray(emails)) {
    return { ok: false, issues: [{ code: "not_array", message: "Sequence is not an array." }] };
  }

  if (emails.length !== expectedLength) {
    issues.push({
      code: "length",
      message: `Expected exactly ${expectedLength} emails, found ${emails.length}.`,
    });
  }

  const seen = new Set<number>();
  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]!;
    const step = email.stepNumber;

    if (!Number.isInteger(step) || step < 1) {
      issues.push({
        code: "step_invalid",
        message: `Invalid stepNumber at index ${i}.`,
        stepNumber: step,
      });
      continue;
    }
    if (seen.has(step)) {
      issues.push({
        code: "step_duplicate",
        message: `Duplicate stepNumber ${step}.`,
        stepNumber: step,
      });
    }
    seen.add(step);

    if (step !== i + 1) {
      issues.push({
        code: "step_order",
        message: `Expected step ${i + 1} at position ${i + 1}, found ${step}.`,
        stepNumber: step,
      });
    }

    if (!email.internalTitle?.trim()) {
      issues.push({ code: "internal_title", message: "Missing internal title.", stepNumber: step });
    }
    if (!email.subject?.trim()) {
      issues.push({ code: "subject", message: "Missing primary subject.", stepNumber: step });
    }
    if (!email.altSubjects?.[0]?.trim() || !email.altSubjects?.[1]?.trim()) {
      issues.push({
        code: "alt_subjects",
        message: "Two alternative subjects are required.",
        stepNumber: step,
      });
    }
    if (!email.previewText?.trim()) {
      issues.push({ code: "preview", message: "Missing preview text.", stepNumber: step });
    }
    if (!email.bodyText?.trim() || email.bodyText.trim().length < 200) {
      issues.push({
        code: "body",
        message: "Body missing or too short for a detailed sequence email.",
        stepNumber: step,
      });
    }
    if (!email.ctaLabel?.trim()) {
      issues.push({ code: "cta_label", message: "Missing CTA label.", stepNumber: step });
    }
    if (
      !email.ctaUrl?.trim() ||
      !(WEBINAR_FOLLOWUP_ALLOWED_CTA_URLS as readonly string[]).includes(email.ctaUrl)
    ) {
      issues.push({
        code: "cta_url",
        message: `CTA URL must be one of: ${WEBINAR_FOLLOWUP_ALLOWED_CTA_URLS.join(", ")}.`,
        stepNumber: step,
      });
    }
    if (!Number.isInteger(email.delayHours) || email.delayHours < 0) {
      issues.push({ code: "delay", message: "Invalid delayHours.", stepNumber: step });
    }
    if (step === 1 && email.delayHours !== 0) {
      issues.push({
        code: "delay_first",
        message: "Email 1 delayHours must be 0.",
        stepNumber: 1,
      });
    }
    if (step > 1 && email.delayHours <= 0) {
      issues.push({
        code: "delay_followup",
        message: "Follow-up emails must have delayHours > 0.",
        stepNumber: step,
      });
    }
    if (!email.angle?.trim()) {
      issues.push({ code: "angle", message: "Missing conversion angle.", stepNumber: step });
    }
    if (!email.category?.trim()) {
      issues.push({ code: "category", message: "Missing category.", stepNumber: step });
    }
  }

  for (let n = 1; n <= expectedLength; n++) {
    if (!seen.has(n)) {
      issues.push({
        code: "step_missing",
        message: `Missing step ${n}.`,
        stepNumber: n,
      });
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, emails };
}

export function assertValidWebinarSequence(emails: SequenceEmailContent[]): SequenceEmailContent[] {
  const result = validateWebinarSequence(emails);
  if (!result.ok) {
    const detail = result.issues
      .slice(0, 8)
      .map((i) => `${i.code}${i.stepNumber ? `@${i.stepNumber}` : ""}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid webinar sequence (${result.issues.length} issues): ${detail}`);
  }
  return result.emails;
}
