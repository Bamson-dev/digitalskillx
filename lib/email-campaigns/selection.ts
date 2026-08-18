import { isSyntheticTestRecipient } from "../email/synthetic-recipient";
import {
  isValidEmail,
  normalizeEmail,
  type EnrollmentSource,
} from "./constants";

export type CandidateRecipient = {
  email: string;
  fullName: string | null;
  profileId: string | null;
};

export type SelectionPreview = {
  source: EnrollmentSource;
  selected: CandidateRecipient[];
  skippedSynthetic: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  skippedSuppressed: number;
  skippedAlreadyEnrolled: number;
  unmatchedCsv: number;
};

export function extractEmailsFromCsv(raw: string): string[] {
  const found: string[] = [];
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  let match: RegExpExecArray | null;
  const text = raw.replace(/\uFEFF/g, "");
  while ((match = re.exec(text))) {
    found.push(normalizeEmail(match[0]));
  }
  return found;
}

export function uniqueCandidates(rows: CandidateRecipient[]): {
  unique: CandidateRecipient[];
  duplicateCount: number;
} {
  const seen = new Set<string>();
  const unique: CandidateRecipient[] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const email = normalizeEmail(row.email);
    if (seen.has(email)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(email);
    unique.push({ ...row, email });
  }
  return { unique, duplicateCount };
}

/**
 * Controlled enrollment filter. Never implies "all database users".
 * Callers must pass an explicit candidate list from buyers / students / CSV.
 */
export function filterEnrollmentCandidates(params: {
  source: EnrollmentSource;
  candidates: CandidateRecipient[];
  suppressedEmails: Set<string>;
  alreadyEnrolledEmails: Set<string>;
}): SelectionPreview {
  let skippedSynthetic = 0;
  let skippedInvalid = 0;
  const valid: CandidateRecipient[] = [];

  for (const row of params.candidates) {
    const email = normalizeEmail(row.email);
    if (!isValidEmail(email)) {
      skippedInvalid += 1;
      continue;
    }
    if (isSyntheticTestRecipient(email)) {
      skippedSynthetic += 1;
      continue;
    }
    valid.push({
      email,
      fullName: row.fullName?.trim() || null,
      profileId: row.profileId,
    });
  }

  const { unique, duplicateCount } = uniqueCandidates(valid);
  const selected: CandidateRecipient[] = [];
  let skippedSuppressed = 0;
  let skippedAlreadyEnrolled = 0;

  for (const row of unique) {
    if (params.suppressedEmails.has(row.email)) {
      skippedSuppressed += 1;
      continue;
    }
    if (params.alreadyEnrolledEmails.has(row.email)) {
      skippedAlreadyEnrolled += 1;
      continue;
    }
    selected.push(row);
  }

  return {
    source: params.source,
    selected,
    skippedSynthetic,
    skippedInvalid,
    skippedDuplicate: duplicateCount,
    skippedSuppressed,
    skippedAlreadyEnrolled,
    unmatchedCsv: 0,
  };
}

export function authorizedCampaignTestAddresses(params: {
  adminEmail: string | null | undefined;
  extraFromEnv?: string;
}): Set<string> {
  const allowed = new Set<string>();
  if (params.adminEmail && isValidEmail(params.adminEmail)) {
    allowed.add(normalizeEmail(params.adminEmail));
  }
  const extra = (params.extraFromEnv ?? process.env.EMAIL_CAMPAIGN_TEST_ADDRESSES ?? "")
    .split(/[,;\s]+/)
    .map(normalizeEmail)
    .filter(isValidEmail);
  for (const email of extra) allowed.add(email);
  return allowed;
}

export function isAuthorizedCampaignTestAddress(
  email: string,
  allowed: Set<string>,
): boolean {
  return allowed.has(normalizeEmail(email));
}
