/** Pure canonical quality decision for Library Build candidates. */

import { compositeQualityScore } from "@/lib/content-factory/library-build/library-build-shared";
import { QUALIFY_SCORE_THRESHOLD } from "@/lib/content-factory/qualify-shared";

export type CanonicalQualityStatus =
  | "pending"
  | "qualified"
  | "rejected"
  | "blocked_duplicate"
  | "failed";

export type QualityDecisionInput = {
  candidateStatus: string;
  ruleScore: number | null;
  aiScore: number | null;
  filterReason: string | null;
  threshold?: number;
  isDuplicate?: boolean;
  duplicateReason?: string | null;
  scoreBreakdown?: Record<string, unknown> | null;
  titleSimilarityWarning?: boolean;
  channelSeen?: boolean;
};

export type QualityDecisionResult = {
  finalQualityScore: number;
  qualityStatus: CanonicalQualityStatus;
  qualityReason: string;
  rejectionReason: string | null;
  canGenerate: boolean;
  canPublish: boolean;
};

export function isDuplicateFilterReason(reason: string | null | undefined): boolean {
  const r = String(reason ?? "").toLowerCase();
  return (
    r.includes("duplicate") ||
    r.includes("already exists") ||
    r.includes("already queued") ||
    r.includes("already processing") ||
    r.includes("normalized title")
  );
}

export function deriveQualityDimensions(input: QualityDecisionInput) {
  const breakdown = input.scoreBreakdown ?? {};
  const rule = input.ruleScore ?? 0;
  const ai = input.aiScore ?? 0;
  const topicMatch = typeof breakdown.topicMatch === "number" ? breakdown.topicMatch : Math.min(10, Math.round(rule / 3));
  const playlistSize = typeof breakdown.playlistSize === "number" ? breakdown.playlistSize : 5;
  const educational = typeof breakdown.educationalKeywords === "number" ? breakdown.educationalKeywords : 5;
  const duplicateRisk =
    input.isDuplicate || isDuplicateFilterReason(input.filterReason) || input.titleSimilarityWarning
      ? 10
      : typeof breakdown.duplicate === "number" && breakdown.duplicate === 0
        ? 8
        : 2;
  const promotionalNoise =
    String(input.filterReason ?? "").toLowerCase().includes("promotional") ||
    String(input.filterReason ?? "").toLowerCase().includes("spam")
      ? 9
      : 1;
  return {
    relevance: Math.min(10, Math.round((topicMatch + ai / 10) / 2)),
    completeness: Math.min(10, Math.round((playlistSize + educational) / 4)),
    structure: Math.min(10, Math.round(rule / 10)),
    educationalClarity: Math.min(10, Math.round(ai / 10)),
    topicFit: Math.min(10, Math.round((topicMatch + ai / 12) / 2)),
    sourceQuality: Math.min(10, Math.round(rule / 12)),
    freshness: 5,
    duplicateRisk,
    promotionalNoise,
    clickbaitRisk: input.titleSimilarityWarning ? 7 : 2,
  };
}

export function computeFinalQualityScore(input: QualityDecisionInput): number {
  const rule = input.ruleScore ?? 0;
  const ai = input.aiScore;
  const composite = compositeQualityScore(deriveQualityDimensions(input));
  if (ai != null) {
    return Math.round(rule * 0.35 + ai * 0.45 + composite.score * 0.2);
  }
  return Math.round(rule * 0.6 + composite.score * 0.4);
}

export function decideCandidateQuality(input: QualityDecisionInput): QualityDecisionResult {
  const threshold = input.threshold ?? QUALIFY_SCORE_THRESHOLD;

  if (input.isDuplicate || isDuplicateFilterReason(input.filterReason)) {
    return {
      finalQualityScore: 0,
      qualityStatus: "blocked_duplicate",
      qualityReason: input.duplicateReason ?? input.filterReason ?? "Duplicate of existing course",
      rejectionReason: "Duplicate of existing course",
      canGenerate: false,
      canPublish: false,
    };
  }

  if (input.candidateStatus === "blocked") {
    return {
      finalQualityScore: 0,
      qualityStatus: "rejected",
      qualityReason: "Source blocked by admin policy",
      rejectionReason: "Source blocked",
      canGenerate: false,
      canPublish: false,
    };
  }

  if (input.candidateStatus === "filtered") {
    const reason = input.filterReason ?? "Filtered during discovery";
    const composite = compositeQualityScore(deriveQualityDimensions(input));
    if (composite.status === "rejected") {
      return {
        finalQualityScore: composite.score,
        qualityStatus: "rejected",
        qualityReason: composite.reason,
        rejectionReason: humanizeRejectionReason(composite.reason),
        canGenerate: false,
        canPublish: false,
      };
    }
    return {
      finalQualityScore: computeFinalQualityScore(input),
      qualityStatus: "rejected",
      qualityReason: reason,
      rejectionReason: humanizeRejectionReason(reason),
      canGenerate: false,
      canPublish: false,
    };
  }

  if (input.candidateStatus === "discovered" && input.aiScore == null) {
    return {
      finalQualityScore: computeFinalQualityScore(input),
      qualityStatus: "pending",
      qualityReason: "Awaiting AI qualification",
      rejectionReason: null,
      canGenerate: false,
      canPublish: false,
    };
  }

  const finalScore = computeFinalQualityScore(input);
  const composite = compositeQualityScore(deriveQualityDimensions(input));

  if (composite.status === "rejected") {
    return {
      finalQualityScore: finalScore,
      qualityStatus: "rejected",
      qualityReason: composite.reason,
      rejectionReason: humanizeRejectionReason(composite.reason),
      canGenerate: false,
      canPublish: false,
    };
  }

  if (finalScore < threshold) {
    return {
      finalQualityScore: finalScore,
      qualityStatus: "rejected",
      qualityReason: `Combined quality score ${finalScore} below threshold ${threshold}`,
      rejectionReason: "Below quality threshold",
      canGenerate: false,
      canPublish: false,
    };
  }

  if (input.candidateStatus === "qualified" && (input.aiScore ?? 0) >= threshold) {
    return {
      finalQualityScore: finalScore,
      qualityStatus: "qualified",
      qualityReason: `Qualified with combined score ${finalScore}`,
      rejectionReason: null,
      canGenerate: true,
      canPublish: false,
    };
  }

  return {
    finalQualityScore: finalScore,
    qualityStatus: "rejected",
    qualityReason: input.filterReason ?? "Did not meet qualification requirements",
    rejectionReason: humanizeRejectionReason(input.filterReason),
    canGenerate: false,
    canPublish: false,
  };
}

export function humanizeRejectionReason(raw: string | null | undefined): string {
  const r = String(raw ?? "").toLowerCase();
  if (!r) return "Rejected during quality review";
  if (r.includes("duplicate")) return "Duplicate of existing course";
  if (r.includes("threshold") || r.includes("below")) return "Below quality threshold";
  if (r.includes("promotional") || r.includes("spam")) return "Too promotional";
  if (r.includes("structure") || r.includes("too_few") || r.includes("too_many")) {
    return "Insufficient lesson structure";
  }
  if (r.includes("metadata") || r.includes("missing")) return "Missing required metadata";
  if (r.includes("unavailable") || r.includes("quota")) return "Source unavailable";
  if (r.includes("artwork")) return "Artwork unavailable";
  if (r.includes("generation")) return "Course generation failed";
  return raw!.slice(0, 200);
}

export function candidatePassesGenerateGate(decision: QualityDecisionResult, candidateStatus: string): boolean {
  return decision.canGenerate && decision.qualityStatus === "qualified" && candidateStatus === "qualified";
}
