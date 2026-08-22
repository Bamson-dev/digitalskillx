/**
 * Persist review-only sequence metadata inside body_html without a schema change.
 * body_text remains the clean sendable body.
 */
import type { SequenceEmailContent } from "./render";
import { WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION } from "./constants";

const META_RE = /^<!--wfu-meta:([\s\S]*?)-->\s*/;

export type StepMeta = {
  altSubjects: [string, string];
  angle: string;
  category: string;
  sourceVersion: string;
};

export function encodeStepBodyHtml(email: SequenceEmailContent): string {
  const meta: StepMeta = {
    altSubjects: email.altSubjects,
    angle: email.angle,
    category: email.category,
    sourceVersion: WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION,
  };
  return `<!--wfu-meta:${JSON.stringify(meta)}-->\n${email.bodyText}`;
}

export function parseStepMeta(bodyHtml: string | null | undefined): StepMeta | null {
  if (!bodyHtml) return null;
  const match = META_RE.exec(bodyHtml);
  if (!match?.[1]) return null;
  try {
    const parsed = JSON.parse(match[1]) as Partial<StepMeta>;
    const a0 = String(parsed.altSubjects?.[0] ?? "").trim();
    const a1 = String(parsed.altSubjects?.[1] ?? "").trim();
    if (!a0 || !a1) return null;
    return {
      altSubjects: [a0, a1],
      angle: String(parsed.angle ?? "").trim(),
      category: String(parsed.category ?? "").trim(),
      sourceVersion: String(parsed.sourceVersion ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function stripStepMeta(bodyHtml: string): string {
  return bodyHtml.replace(META_RE, "");
}
