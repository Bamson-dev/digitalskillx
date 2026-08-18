import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AIMONEYCODE_TOTAL_STEPS, ctaUrlForStep } from "./constants";
import {
  assertCompleteSequence,
  parseAimoneycodeSequence,
  type ParsedCampaignEmail,
} from "./parse-sequence";
import sequenceMarkdown from "../../content/aimoneycode-30-day-email-sequence.md";

export type { ParsedCampaignEmail };

const SEQUENCE_RELATIVE_PATH = join("content", "aimoneycode-30-day-email-sequence.md");

let cached: ParsedCampaignEmail[] | null = null;

export function aimoneycodeSequenceFilePath(root = process.cwd()): string {
  return join(root, SEQUENCE_RELATIVE_PATH);
}

function readSequenceMarkdown(root = process.cwd()): string {
  try {
    return readFileSync(aimoneycodeSequenceFilePath(root), "utf8");
  } catch {
    if (typeof sequenceMarkdown === "string" && sequenceMarkdown.trim()) {
      return sequenceMarkdown;
    }
    throw new Error(
      "AI Money Code sequence copy is missing from the server bundle. Redeploy so content/aimoneycode-30-day-email-sequence.md is included.",
    );
  }
}

export function loadAimoneycodeSequence(root = process.cwd()): ParsedCampaignEmail[] {
  if (cached) return cached;
  const emails = parseAimoneycodeSequence(readSequenceMarkdown(root));
  assertCompleteSequence(emails);
  cached = emails;
  return emails;
}

export function getAimoneycodeEmail(stepNumber: number, root = process.cwd()): ParsedCampaignEmail {
  if (stepNumber < 1 || stepNumber > AIMONEYCODE_TOTAL_STEPS) {
    throw new Error(`Invalid campaign step ${stepNumber}`);
  }
  const email = loadAimoneycodeSequence(root)[stepNumber - 1];
  if (!email) throw new Error(`Missing campaign email for day ${stepNumber}`);
  return {
    ...email,
    ctaLink: ctaUrlForStep(stepNumber),
  };
}

/** Reset parser cache — tests only. */
export function resetAimoneycodeSequenceCache() {
  cached = null;
}
