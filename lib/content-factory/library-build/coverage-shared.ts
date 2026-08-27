/** Centralized topic coverage thresholds for Library Build Engine. */

export const TOPIC_COVERAGE_THRESHOLDS = {
  /** Courses at or above this count are "strong" when also >= strongMinAbsolute. */
  strongMinAbsolute: 8,
  /** Multiplier of per-topic target for "strong" status. */
  strongTargetMultiplier: 1.5,
  /** Multiplier of per-topic target for "good" status. */
  goodTargetMultiplier: 1.0,
  /** Multiplier of per-topic target for "developing" status. */
  developingTargetMultiplier: 0.5,
  /** Absolute minimum before "needs_content" when target is higher. */
  needsContentMaxExclusive: 3,
} as const;

export type TopicCoverageStatus =
  | "unknown"
  | "high_priority"
  | "needs_content"
  | "developing"
  | "good"
  | "strong";

export function perTopicTargetCoverage(
  categoryPreferredTarget: number,
  topicsInCategory: number,
  topicMinimumOverride?: number | null,
): number {
  if (topicMinimumOverride != null && topicMinimumOverride > 0) return topicMinimumOverride;
  const perTopic = topicsInCategory > 0 ? Math.ceil(categoryPreferredTarget / topicsInCategory) : categoryPreferredTarget;
  return Math.max(3, perTopic);
}

export function computeTopicCoverageStatusFromCounts(input: {
  publishedCount: number;
  targetCoverage: number;
}): TopicCoverageStatus {
  const count = Math.max(0, input.publishedCount);
  const target = Math.max(1, input.targetCoverage);
  const t = TOPIC_COVERAGE_THRESHOLDS;

  if (count <= 0) return "high_priority";
  if (count < Math.min(t.needsContentMaxExclusive, target)) return "needs_content";

  const developingMin = Math.max(1, Math.floor(target * t.developingTargetMultiplier));
  const goodMin = Math.max(developingMin + 1, Math.floor(target * t.goodTargetMultiplier));
  const strongMin = Math.max(
    goodMin + 1,
    Math.floor(target * t.strongTargetMultiplier),
    t.strongMinAbsolute,
  );

  if (count >= strongMin) return "strong";
  if (count >= goodMin) return "good";
  if (count >= developingMin) return "developing";
  return "needs_content";
}

export function coveragePercentage(publishedCount: number, targetCoverage: number): number {
  if (targetCoverage <= 0) return publishedCount > 0 ? 100 : 0;
  return Math.min(100, Math.round((Math.max(0, publishedCount) / targetCoverage) * 100));
}

export function countsTowardTopicCoverage(pathStatus: string | null | undefined): boolean {
  return pathStatus === "published";
}
