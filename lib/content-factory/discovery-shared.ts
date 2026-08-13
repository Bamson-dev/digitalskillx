/** Client-safe discovery constants and deterministic scoring (no secrets, no I/O). */

export const DISCOVERY_MIN_VIDEOS = 5;
export const DISCOVERY_MAX_VIDEOS = 40;
export const DISCOVERY_SWEET_MIN = 8;
export const DISCOVERY_SWEET_MAX = 25;
export const DISCOVERY_TARGET_DEFAULT = 20;
export const DISCOVERY_TARGET_MAX = 50;
export const DISCOVERY_TOPIC_MAX_LEN = 80;
export const DISCOVERY_SEARCH_MAX_PER_DAY = 10;
export const DISCOVERY_TOPIC_COOLDOWN_HOURS = 24;
export const DISCOVERY_SEARCH_PAGE_SIZE = 25;

export const EDUCATIONAL_KEYWORDS = [
  "course",
  "tutorial",
  "learn",
  "fundamentals",
  "playlist",
  "guide",
] as const;

export const SPAM_TERMS = [
  "official music video",
  "lyrics",
  "nightcore",
  "vlog",
  "haul",
  "prank",
  "funny moments",
  "compilation",
] as const;

export type DiscoveryScoreBreakdown = {
  topicMatch: number;
  playlistSize: number;
  educationalKeywords: number;
  channelDescription: number;
  duplicate: number;
  aiQualification: number | null;
  aiRelevant?: boolean | null;
  aiReason?: string | null;
  titleSimilarityWarning?: boolean;
  channelSeen?: boolean;
};

export function buildDiscoverySearchQuery(topic: string): string {
  return `${topic.trim()} tutorial playlist`;
}

export function normalizeDiscoveryTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ");
}

export function validateDiscoveryInput(params: {
  topic: string;
  targetGenerate?: number;
}): { topic: string; targetGenerate: number } | { error: string } {
  const topic = normalizeDiscoveryTopic(params.topic ?? "");
  if (!topic) return { error: "Topic is required." };
  if (topic.length < 2) return { error: "Topic is too short." };
  if (topic.length > DISCOVERY_TOPIC_MAX_LEN) {
    return { error: `Topic must be ${DISCOVERY_TOPIC_MAX_LEN} characters or fewer.` };
  }
  const target =
    params.targetGenerate == null ? DISCOVERY_TARGET_DEFAULT : Number(params.targetGenerate);
  if (!Number.isInteger(target) || target <= 0) {
    return { error: "targetGenerate must be a positive integer." };
  }
  if (target > DISCOVERY_TARGET_MAX) {
    return { error: `targetGenerate cannot exceed ${DISCOVERY_TARGET_MAX}.` };
  }
  return { topic, targetGenerate: target };
}

export function topicTokens(topic: string): string[] {
  return normalizeDiscoveryTopic(topic)
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3);
}

export function hasSpamTerms(text: string): boolean {
  const hay = text.toLowerCase();
  return SPAM_TERMS.some((term) => hay.includes(term));
}

export function educationalKeywordScore(text: string): number {
  const hay = text.toLowerCase();
  const hits = EDUCATIONAL_KEYWORDS.filter((k) => hay.includes(k)).length;
  if (hits >= 2) return 15;
  if (hits === 1) return 10;
  return 0;
}

export function topicMatchScore(topic: string, text: string): number {
  const tokens = topicTokens(topic);
  if (!tokens.length) return 0;
  const hay = text.toLowerCase();
  const matched = tokens.filter((t) => hay.includes(t)).length;
  return Math.round((matched / tokens.length) * 25);
}

export function playlistSizeScore(itemCount: number | null): number {
  if (itemCount == null) return 0;
  if (itemCount < DISCOVERY_MIN_VIDEOS || itemCount > DISCOVERY_MAX_VIDEOS) return 0;
  if (itemCount >= DISCOVERY_SWEET_MIN && itemCount <= DISCOVERY_SWEET_MAX) return 20;
  return 12;
}

export function channelDescriptionScore(description: string | null | undefined): number {
  const len = (description ?? "").trim().length;
  if (len > 40) return 10;
  if (len > 0) return 5;
  return 0;
}

export function scoreDiscoveryCandidate(input: {
  topic: string;
  title: string;
  description: string;
  channelTitle: string;
  itemCount: number | null;
  channelDescription?: string | null;
  isDuplicate: boolean;
}): { ruleScore: number; breakdown: DiscoveryScoreBreakdown; filterReason: string | null } {
  const blob = `${input.title} ${input.description} ${input.channelTitle}`;
  const breakdown: DiscoveryScoreBreakdown = {
    topicMatch: topicMatchScore(input.topic, blob),
    playlistSize: playlistSizeScore(input.itemCount),
    educationalKeywords: educationalKeywordScore(blob),
    channelDescription: channelDescriptionScore(input.channelDescription),
    duplicate: input.isDuplicate ? 0 : 15,
    aiQualification: null,
  };

  let filterReason: string | null = null;
  if (input.isDuplicate) filterReason = "duplicate";
  else if (input.itemCount == null) filterReason = "missing_item_count";
  else if (input.itemCount < DISCOVERY_MIN_VIDEOS) filterReason = "too_few_videos";
  else if (input.itemCount > DISCOVERY_MAX_VIDEOS) filterReason = "too_many_videos";
  else if (hasSpamTerms(blob)) filterReason = "spam_or_non_educational";
  else if (breakdown.topicMatch < 8) filterReason = "weak_topic_overlap";

  const ruleScore = filterReason
    ? Math.min(
        85,
        breakdown.topicMatch +
          breakdown.playlistSize +
          breakdown.educationalKeywords +
          breakdown.channelDescription +
          breakdown.duplicate,
      )
    : breakdown.topicMatch +
      breakdown.playlistSize +
      breakdown.educationalKeywords +
      breakdown.channelDescription +
      breakdown.duplicate;

  return { ruleScore: Math.min(85, ruleScore), breakdown, filterReason };
}
