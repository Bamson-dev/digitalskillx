/**
 * Pure Learn discovery helpers (search/filter/sort/recommendations).
 * No secrets, no I/O — safe for unit tests.
 */

import {
  categoryMatchesFilter,
  normalizeLibraryCategory,
  parseLibraryCategory,
  sanitizeLibraryQuery,
  type LibraryCategoryId,
} from "@/lib/content-factory/library-shared";

/** Short < 2h, medium 2–6h, long ≥ 6h (estimated_duration_seconds). */
export const DURATION_BUCKETS = ["short", "medium", "long"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export const LEARN_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type LearnDifficulty = (typeof LEARN_DIFFICULTIES)[number];

export const LEARN_SORTS = ["newest", "updated", "shortest", "longest"] as const;
export type LearnSort = (typeof LEARN_SORTS)[number];

/** Certificate discovery filters — never expose price amounts. */
export const CERTIFICATE_FILTERS = ["any", "available", "free", "paid"] as const;
export type CertificateFilter = (typeof CERTIFICATE_FILTERS)[number];

export const SHORT_MAX_SECONDS = 2 * 60 * 60;
export const MEDIUM_MAX_SECONDS = 6 * 60 * 60;

export function durationBucketFromSeconds(seconds: number | null | undefined): DurationBucket | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < SHORT_MAX_SECONDS) return "short";
  if (seconds < MEDIUM_MAX_SECONDS) return "medium";
  return "long";
}

export function parseDurationBucket(raw: string | null | undefined): DurationBucket | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return (DURATION_BUCKETS as readonly string[]).includes(v) ? (v as DurationBucket) : null;
}

export function parseLearnDifficulty(raw: string | null | undefined): LearnDifficulty | null {
  const v = String(raw ?? "").trim().toLowerCase();
  return (LEARN_DIFFICULTIES as readonly string[]).includes(v) ? (v as LearnDifficulty) : null;
}

export function parseLearnSort(raw: string | null | undefined): LearnSort {
  const v = String(raw ?? "").trim().toLowerCase();
  return (LEARN_SORTS as readonly string[]).includes(v) ? (v as LearnSort) : "newest";
}

export function parseCertificateFilter(raw: string | null | undefined): CertificateFilter {
  const v = String(raw ?? "").trim().toLowerCase();
  return (CERTIFICATE_FILTERS as readonly string[]).includes(v) ? (v as CertificateFilter) : "any";
}

export type LearnDiscoveryParams = {
  q: string;
  category: LibraryCategoryId;
  difficulty: LearnDifficulty | null;
  duration: DurationBucket | null;
  certificate: CertificateFilter;
  sort: LearnSort;
  page: number;
};

export function parseLearnDiscoverySearchParams(input: {
  q?: string | null;
  category?: string | null;
  difficulty?: string | null;
  duration?: string | null;
  certificate?: string | null;
  sort?: string | null;
  page?: string | null;
}): LearnDiscoveryParams {
  const page = Number(input.page);
  return {
    q: sanitizeLibraryQuery(input.q),
    category: parseLibraryCategory(input.category),
    difficulty: parseLearnDifficulty(input.difficulty),
    duration: parseDurationBucket(input.duration),
    certificate: parseCertificateFilter(input.certificate),
    sort: parseLearnSort(input.sort),
    page: Number.isInteger(page) && page >= 1 ? Math.min(100, page) : 1,
  };
}

export function learnDiscoveryHref(params: Partial<LearnDiscoveryParams> & { page?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category && params.category !== "all") search.set("category", params.category);
  if (params.difficulty) search.set("difficulty", params.difficulty);
  if (params.duration) search.set("duration", params.duration);
  if (params.certificate && params.certificate !== "any") search.set("certificate", params.certificate);
  if (params.sort && params.sort !== "newest") search.set("sort", params.sort);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/learn?${qs}` : "/learn";
}

export function countActiveLearnFilters(params: LearnDiscoveryParams): number {
  let n = 0;
  if (params.q) n += 1;
  if (params.category !== "all") n += 1;
  if (params.difficulty) n += 1;
  if (params.duration) n += 1;
  if (params.certificate !== "any") n += 1;
  if (params.sort !== "newest") n += 1;
  return n;
}

export type DiscoverablePath = {
  id: string;
  slug: string;
  title: string;
  short_description?: string | null;
  description?: string | null;
  category: string;
  difficulty?: string | null;
  tags?: string[] | null;
  learning_objectives?: string[] | null;
  estimated_duration_seconds?: number | null;
  certificate_enabled?: boolean | null;
  certificate_pricing_mode?: string | null;
  published_at?: string | null;
  updated_at?: string | null;
  status?: string | null;
};

export function pathMatchesCertificateFilter(
  path: Pick<DiscoverablePath, "certificate_enabled" | "certificate_pricing_mode">,
  filter: CertificateFilter,
): boolean {
  if (filter === "any") return true;
  const enabled = path.certificate_enabled === true;
  if (filter === "available") return enabled;
  if (filter === "free") return enabled && path.certificate_pricing_mode === "free";
  if (filter === "paid") {
    return enabled && path.certificate_pricing_mode !== "free";
  }
  return true;
}

export function pathMatchesDiscoveryFilters(
  path: DiscoverablePath,
  params: Pick<LearnDiscoveryParams, "q" | "category" | "difficulty" | "duration" | "certificate">,
): boolean {
  if (path.status && path.status !== "published") return false;
  if (!categoryMatchesFilter(path.category, params.category)) return false;
  if (params.difficulty && String(path.difficulty ?? "").toLowerCase() !== params.difficulty) return false;
  if (params.duration) {
    const bucket = durationBucketFromSeconds(path.estimated_duration_seconds);
    if (bucket !== params.duration) return false;
  }
  if (!pathMatchesCertificateFilter(path, params.certificate)) return false;
  if (params.q) {
    const q = params.q.toLowerCase();
    const hay = [
      path.title,
      path.short_description,
      path.description,
      path.category,
      ...(path.tags ?? []),
      ...(path.learning_objectives ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

export function sortDiscoverablePaths<T extends DiscoverablePath>(paths: T[], sort: LearnSort): T[] {
  const copy = [...paths];
  const byId = (a: T, b: T) => a.id.localeCompare(b.id);
  copy.sort((a, b) => {
    if (sort === "shortest") {
      const as = a.estimated_duration_seconds ?? Number.POSITIVE_INFINITY;
      const bs = b.estimated_duration_seconds ?? Number.POSITIVE_INFINITY;
      return as - bs || byId(a, b);
    }
    if (sort === "longest") {
      const as = a.estimated_duration_seconds ?? -1;
      const bs = b.estimated_duration_seconds ?? -1;
      return bs - as || byId(a, b);
    }
    if (sort === "updated") {
      const at = Date.parse(a.updated_at ?? a.published_at ?? "") || 0;
      const bt = Date.parse(b.updated_at ?? b.published_at ?? "") || 0;
      return bt - at || byId(a, b);
    }
    // newest (default)
    const at = Date.parse(a.published_at ?? "") || 0;
    const bt = Date.parse(b.published_at ?? "") || 0;
    return bt - at || byId(a, b);
  });
  return copy;
}

export type LearnerPathHistory = {
  pathId: string;
  category: string;
  difficulty?: string | null;
  completed: boolean;
  inProgress: boolean;
};

export type RecommendablePath = DiscoverablePath & {
  published_at?: string | null;
  short_description?: string | null;
  artwork_public_url?: string | null;
};

/**
 * Deterministic recommendations. Never returns unpublished / already completed /
 * currently in-progress paths (those belong in Continue Learning).
 */
export function recommendLearningPaths(params: {
  catalog: RecommendablePath[];
  history: LearnerPathHistory[];
  limit?: number;
  excludeIds?: string[];
}): RecommendablePath[] {
  const limit = Math.max(1, Math.min(24, params.limit ?? 6));
  const exclude = new Set<string>([
    ...(params.excludeIds ?? []),
    ...params.history.filter((h) => h.completed || h.inProgress).map((h) => h.pathId),
  ]);

  const published = params.catalog.filter(
    (p) => (!p.status || p.status === "published") && !exclude.has(p.id),
  );

  const inProgressCats = new Set<string>(
    params.history
      .filter((h) => h.inProgress)
      .map((h) => normalizeLibraryCategory(h.category))
      .filter((c) => c !== "other" && c !== "all"),
  );
  const completedCats = new Set<string>(
    params.history
      .filter((h) => h.completed)
      .map((h) => normalizeLibraryCategory(h.category))
      .filter((c) => c !== "other" && c !== "all"),
  );
  const hasHistory = params.history.some((h) => h.completed || h.inProgress);

  const scored = published.map((path) => {
    let score = 0;
    const cat = normalizeLibraryCategory(path.category);
    if (inProgressCats.has(cat)) score += 100;
    if (completedCats.has(cat)) score += 70;
    if (!hasHistory && path.difficulty === "beginner") score += 40;
    if (hasHistory) {
      const completedDiffs = params.history.filter((h) => h.completed).map((h) => h.difficulty);
      if (completedDiffs.includes("beginner") && path.difficulty === "intermediate") score += 25;
      if (completedDiffs.includes("intermediate") && path.difficulty === "advanced") score += 25;
    }
    const publishedAt = Date.parse(path.published_at ?? "") || 0;
    score += Math.min(20, Math.floor(publishedAt / 1e11)); // slight recency bias, deterministic
    return { path, score };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(b.path.published_at ?? "") - Date.parse(a.path.published_at ?? "") ||
      a.path.id.localeCompare(b.path.id),
  );

  return scored.slice(0, limit).map((row) => row.path);
}

/** Difficulty proximity: beginner↔intermediate↔advanced. */
export function difficultyProximity(a: string | null | undefined, b: string | null | undefined): number {
  const order = ["beginner", "intermediate", "advanced"];
  const ai = order.indexOf(String(a ?? "").toLowerCase());
  const bi = order.indexOf(String(b ?? "").toLowerCase());
  if (ai < 0 || bi < 0) return 2;
  return Math.abs(ai - bi);
}

export function relatedCoursesRanked<
  T extends {
    id: string;
    category: string;
    title: string;
    difficulty?: string | null;
    estimated_duration_seconds?: number | null;
    tags?: string[] | null;
    status?: string | null;
  },
>(
  catalog: T[],
  seed: {
    id: string;
    category: string;
    difficulty?: string | null;
    estimated_duration_seconds?: number | null;
    tags?: string[] | null;
  },
  limit = 4,
): T[] {
  const seedCat = normalizeLibraryCategory(seed.category);
  const seedTags = new Set((seed.tags ?? []).map((t) => t.toLowerCase()));
  const scored = catalog
    .filter((row) => row.id !== seed.id && (!row.status || row.status === "published"))
    .map((row) => {
      let score = 0;
      const cat = normalizeLibraryCategory(row.category);
      if (seedCat !== "other" && cat === seedCat) score += 80;
      score += Math.max(0, 20 - difficultyProximity(seed.difficulty, row.difficulty) * 8);
      const sd = seed.estimated_duration_seconds;
      const rd = row.estimated_duration_seconds;
      if (sd != null && rd != null && sd > 0 && rd > 0) {
        const ratio = Math.min(sd, rd) / Math.max(sd, rd);
        score += Math.round(ratio * 15);
      }
      for (const tag of row.tags ?? []) {
        if (seedTags.has(tag.toLowerCase())) score += 6;
      }
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));

  return scored.slice(0, limit).map((s) => s.row);
}
