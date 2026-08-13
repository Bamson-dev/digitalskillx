/** Pure Stage 6 operations helpers (no secrets, no I/O). */

export const DISCOVERY_SEARCH_MAX_PER_RUN = 5;
export const DISCOVERY_SEARCH_MAX_PER_DAY = 10;
export const DISCOVERY_TOPICS_MAX_PER_REQUEST = 10;
export const STALE_PROCESSING_MS = 20 * 60 * 1000;
export const FACTORY_RETRY_MAX_ATTEMPTS = 3;

export const DISCOVERY_QUERY_TEMPLATES = [
  "{topic} tutorial playlist",
  "{topic} course playlist",
  "{topic} complete course",
  "{topic} learn playlist",
  "{topic} fundamentals playlist",
] as const;

export type CandidateFilterInput = {
  topic?: string;
  status?: string;
  creator?: string;
  minRuleScore?: number | null;
  minAiScore?: number | null;
  minVideos?: number | null;
  createdFrom?: string | null;
};

export type FactoryHealthCounts = {
  jobs: { queued: number; processing: number; review: number; published: number; failed: number };
  discovery: { queued: number; running: number; completed: number; failed: number };
  quality: { passed: number; warning: number; needs_revision: number };
  costs: {
    youtubeSearches24h: number;
    qualifyCalls: number;
    researchCalls: number;
    qualityCalls: number;
    generationJobs: number;
    retryJobs: number;
  };
  lastActivityAt: string | null;
};

export function searchMaxPerRun(raw: string | undefined): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return Math.min(DISCOVERY_QUERY_TEMPLATES.length, n);
  return DISCOVERY_SEARCH_MAX_PER_RUN;
}

export function searchMaxPerDay(raw: string | undefined): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  return DISCOVERY_SEARCH_MAX_PER_DAY;
}

export function buildDiscoverySearchQuery(topic: string): string {
  return `${topic.trim()} tutorial playlist`;
}

export function buildDiscoverySearchQueries(topic: string, max = DISCOVERY_SEARCH_MAX_PER_RUN): string[] {
  const trimmed = topic.trim();
  if (!trimmed) return [];
  const limit = Math.max(1, Math.min(DISCOVERY_QUERY_TEMPLATES.length, max));
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const template of DISCOVERY_QUERY_TEMPLATES) {
    if (queries.length >= limit) break;
    const query = template.replace("{topic}", trimmed);
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
  }
  return queries;
}

export function parseDiscoveryTopics(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[\n,;]+/)) {
    const topic = part.trim().replace(/\s+/g, " ");
    if (topic.length < 2) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(topic);
    if (out.length >= DISCOVERY_TOPICS_MAX_PER_REQUEST) break;
  }
  return out;
}

export function normalizeComparableTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeComparableTitle(a).split(" ").filter((t) => t.length >= 3));
  const right = new Set(normalizeComparableTitle(b).split(" ").filter((t) => t.length >= 3));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / new Set([...left, ...right]).size;
}

export function similarTitleWarning(params: {
  title: string;
  otherTitle: string;
  channelId?: string | null;
  otherChannelId?: string | null;
}): boolean {
  if (params.channelId && params.otherChannelId && params.channelId === params.otherChannelId) {
    return titleSimilarity(params.title, params.otherTitle) >= 0.85;
  }
  return false;
}

export function isRetryableFactoryError(message: string | null | undefined): boolean {
  const lower = (message ?? "").toLowerCase();
  if (!lower.trim()) return false;
  if (isPermanentFactoryError(lower)) return false;
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("aborted")) return true;
  if (lower.includes("stale_processing_reclaim")) return true;
  if (/\(429\)/.test(lower) || lower.includes("too many requests")) return true;
  if (/\((5\d\d)\)/.test(lower)) return true;
  if (lower.includes("deepseek request failed")) return true;
  if (lower.includes("youtube") && (lower.includes("unavailable") || lower.includes("temporarily"))) return true;
  return false;
}

export function isPermanentFactoryError(message: string | null | undefined): boolean {
  const lower = (message ?? "").toLowerCase();
  if (lower.includes("invalid playlist") || lower.includes("playlist not found")) return true;
  if (lower.includes("deleted playlist") || lower.includes("deleted video")) return true;
  if (lower.includes("blocked source") || lower.includes("blocked playlist") || lower.includes("blocked channel")) {
    return true;
  }
  if (lower.includes("invalid input") || lower.includes("invalid youtube")) return true;
  if (lower.includes("content factory is disabled")) return true;
  if (lower.includes("already exists for this playlist")) return true;
  return false;
}

export function staleJobReclaimAction(input: {
  status: string;
  claimedAt: string | null;
  attempts: number;
  now?: number;
  timeoutMs?: number;
}): "requeue" | "fail" | "none" {
  if (input.status !== "processing") return "none";
  if (!input.claimedAt) return "none";
  const claimed = Date.parse(input.claimedAt);
  if (!Number.isFinite(claimed)) return "none";
  const timeoutMs = input.timeoutMs ?? STALE_PROCESSING_MS;
  if ((input.now ?? Date.now()) - claimed < timeoutMs) return "none";
  if (input.attempts >= FACTORY_RETRY_MAX_ATTEMPTS) return "fail";
  return "requeue";
}

export function matchesCandidateFilters<T extends {
  topic: string;
  status: string;
  channel_title: string;
  rule_score: number | null;
  ai_score: number | null;
  item_count: number | null;
  created_at: string;
  factory_job_id?: string | null;
}>(row: T, filters: CandidateFilterInput): boolean {
  if (filters.topic && !row.topic.toLowerCase().includes(filters.topic.trim().toLowerCase())) return false;
  if (filters.creator && !row.channel_title.toLowerCase().includes(filters.creator.trim().toLowerCase())) {
    return false;
  }
  if (filters.minRuleScore != null && (row.rule_score ?? -1) < filters.minRuleScore) return false;
  if (filters.minAiScore != null && (row.ai_score ?? -1) < filters.minAiScore) return false;
  if (filters.minVideos != null && (row.item_count ?? -1) < filters.minVideos) return false;
  if (filters.createdFrom && row.created_at < filters.createdFrom) return false;
  if (filters.status) {
    const wanted = filters.status.trim().toLowerCase();
    if (wanted === "generated") {
      return row.status === "generating" || row.status === "review" || row.status === "published";
    }
    if (wanted === "failed") return false;
    if (row.status !== wanted) return false;
  }
  return true;
}

export function inspectPublishedPathSeo(input: {
  title: string;
  slug: string;
  shortDescription: string;
  seoTitle: string | null;
  seoDescription: string | null;
  creatorName: string | null;
  lessonCount: number;
  hasPlaylistSource: boolean;
  hasCanonicalHint: boolean;
}): Array<{ field: string; message: string }> {
  const issues: Array<{ field: string; message: string }> = [];
  if (!input.title.trim()) issues.push({ field: "title", message: "Published path is missing a title." });
  if (!input.shortDescription.trim()) {
    issues.push({ field: "description", message: "Published path is missing a description." });
  }
  if (!input.slug.trim()) issues.push({ field: "slug", message: "Published path is missing a slug." });
  if (!input.hasCanonicalHint) issues.push({ field: "canonical", message: "Canonical URL metadata is missing." });
  if (!input.creatorName?.trim()) issues.push({ field: "creator", message: "Creator attribution is missing." });
  if (input.lessonCount < 3) issues.push({ field: "lessons", message: "Curriculum is thinner than recommended." });
  if (!input.hasPlaylistSource) issues.push({ field: "source", message: "Source attribution is missing." });
  if (!input.seoTitle?.trim()) issues.push({ field: "seo_title", message: "SEO title is missing." });
  if (!input.seoDescription?.trim()) issues.push({ field: "seo_description", message: "SEO description is missing." });
  return issues;
}

export function parseCandidateFilters(params: {
  topic?: string | null;
  status?: string | null;
  creator?: string | null;
  minRuleScore?: string | null;
  minAiScore?: string | null;
  minVideos?: string | null;
  createdFrom?: string | null;
}): CandidateFilterInput {
  const num = (raw: string | null | undefined) => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    topic: params.topic?.trim() || undefined,
    status: params.status?.trim() || undefined,
    creator: params.creator?.trim() || undefined,
    minRuleScore: num(params.minRuleScore),
    minAiScore: num(params.minAiScore),
    minVideos: num(params.minVideos),
    createdFrom: params.createdFrom?.trim() || null,
  };
}
