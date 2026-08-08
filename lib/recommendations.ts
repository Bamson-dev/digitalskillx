import { filterStorefrontCourses } from "@/lib/storefront-visibility";

/**
 * Only emit a reason when real product data supports it.
 * Do not claim "popular" without enrollment signals.
 */
export type RecommendationReason = "related" | "continue" | "new";

export type RecommendableCourse = {
  id: string;
  title: string;
  description?: string | null;
  short_description?: string | null;
  thumbnail_url?: string | null;
  price_ngn?: number;
  price_usd?: number;
  instructor_name?: string | null;
  category_name?: string | null;
  created_at?: string | null;
  is_coming_soon?: boolean;
};

export type CourseRecommendation = {
  course: RecommendableCourse;
  reason?: RecommendationReason;
};

export function reasonLabel(reason?: RecommendationReason): string | undefined {
  switch (reason) {
    case "related":
      return "Related to this course";
    case "continue":
      return "Continue your learning";
    case "new":
      return "New on DigitalSkillX";
    default:
      return undefined;
  }
}

/**
 * Heuristic recommendations (Experience 2.0 v1 — no DB relationships).
 * - Excludes owned courses and storefront-hidden titles
 * - Prefers same category as seed when known
 * - Caps results
 * - Reasons only when data-backed
 */
export function recommendCourses(params: {
  catalog: RecommendableCourse[];
  ownedIds?: Iterable<string>;
  seed?: Pick<RecommendableCourse, "id" | "category_name" | "title"> | null;
  /** Prefer “continue” label when seed is an in-progress owned course (rare on commerce surfaces). */
  preferContinue?: boolean;
  limit?: number;
}): CourseRecommendation[] {
  const owned = new Set(params.ownedIds ?? []);
  const limit = Math.max(1, Math.min(params.limit ?? 4, 8));
  const seedId = params.seed?.id;
  const seedCategory = params.seed?.category_name?.trim().toLowerCase() ?? "";

  const pool = filterStorefrontCourses(params.catalog).filter(
    (c) => c.id !== seedId && !owned.has(c.id) && !c.is_coming_soon,
  );

  const scored = pool.map((course) => {
    let score = 0;
    let reason: RecommendationReason | undefined;

    const cat = course.category_name?.trim().toLowerCase() ?? "";
    if (seedCategory && cat && cat === seedCategory) {
      score += 50;
      reason = params.preferContinue ? "continue" : "related";
    }

    if (course.thumbnail_url) score += 5;

    if (course.created_at) {
      const age = Date.now() - new Date(course.created_at).getTime();
      if (Number.isFinite(age) && age < 1000 * 60 * 60 * 24 * 45) {
        score += 8;
        if (!reason) reason = "new";
      }
    }

    // Leave reason undefined when we only have soft ranking — never invent popularity.

    return { course, score, reason };
  });

  scored.sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title));

  return scored.slice(0, limit).map(({ course, reason }) => ({
    course,
    ...(reason ? { reason } : {}),
  }));
}
