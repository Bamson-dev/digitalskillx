import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  recommendCourses,
  type CourseRecommendation,
  type RecommendableCourse,
  type RecommendationReason,
} from "@/lib/recommendations";

export type RecommendationKind =
  | "cross_sell"
  | "upsell"
  | "downsell"
  | "related"
  | "next_step"
  | "frequently_bought"
  | "upgrade"
  | "bundle_component"
  | "recommended";

export const RECOMMENDATION_KIND_LABELS: Record<RecommendationKind, string> = {
  cross_sell: "Cross-sell",
  upsell: "Upsell",
  downsell: "Downsell",
  related: "Related",
  next_step: "Next step",
  frequently_bought: "Frequently bought together",
  upgrade: "Upgrade",
  bundle_component: "Bundle component",
  recommended: "Recommended",
};

export type CourseRecommendationRow = {
  id: string;
  course_id: string;
  recommended_course_id: string;
  kind: RecommendationKind;
  sort_order: number;
  active: boolean;
};

/**
 * Admin-selected recommendations for a course, falling back to heuristic recommendCourses.
 */
export async function getCourseRecommendationsForDisplay(
  admin: SupabaseClient,
  params: {
    courseId: string;
    catalog: RecommendableCourse[];
    ownedIds?: Iterable<string>;
    kind?: RecommendationKind | RecommendationKind[];
    limit?: number;
  },
): Promise<CourseRecommendation[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 4, 8));
  const kinds = params.kind
    ? Array.isArray(params.kind)
      ? params.kind
      : [params.kind]
    : (["cross_sell", "upsell", "related", "next_step", "upgrade", "recommended", "frequently_bought"] as RecommendationKind[]);

  const owned = new Set(params.ownedIds ?? []);
  const byId = new Map(params.catalog.map((c) => [c.id, c]));

  let adminRows: CourseRecommendationRow[] = [];
  try {
    const { data, error } = await admin
      .from("course_recommendations")
      .select("id, course_id, recommended_course_id, kind, sort_order, active")
      .eq("course_id", params.courseId)
      .eq("active", true)
      .in("kind", kinds)
      .order("sort_order", { ascending: true })
      .limit(limit);
    if (error) {
      if (!isMissingRelationError(error.message)) {
        console.error("[course-recommendations]", error.message);
      }
    } else {
      adminRows = (data ?? []) as CourseRecommendationRow[];
    }
  } catch {
    adminRows = [];
  }

  const fromAdmin: CourseRecommendation[] = [];
  for (const row of adminRows) {
    if (owned.has(row.recommended_course_id)) continue;
    const course = byId.get(row.recommended_course_id);
    if (!course || course.is_coming_soon) continue;
    const reason: RecommendationReason =
      row.kind === "related" || row.kind === "frequently_bought"
        ? "related"
        : row.kind === "upsell" || row.kind === "upgrade" || row.kind === "next_step"
          ? "continue"
          : "related";
    fromAdmin.push({ course, reason });
  }

  if (fromAdmin.length >= limit) return fromAdmin.slice(0, limit);

  const seed = byId.get(params.courseId) ?? null;
  const heuristic = recommendCourses({
    catalog: params.catalog,
    ownedIds: new Set([...owned, ...fromAdmin.map((r) => r.course.id)]),
    seed,
    limit: limit - fromAdmin.length,
  });

  return [...fromAdmin, ...heuristic].slice(0, limit);
}

export async function listCourseRecommendations(
  admin: SupabaseClient,
  courseId: string,
): Promise<CourseRecommendationRow[]> {
  const { data, error } = await admin
    .from("course_recommendations")
    .select("id, course_id, recommended_course_id, kind, sort_order, active")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as CourseRecommendationRow[];
}

export async function upsertCourseRecommendation(
  admin: SupabaseClient,
  input: {
    courseId: string;
    recommendedCourseId: string;
    kind: RecommendationKind;
    sortOrder?: number;
    active?: boolean;
  },
): Promise<CourseRecommendationRow> {
  if (input.courseId === input.recommendedCourseId) {
    throw new Error("A course cannot recommend itself.");
  }
  const { data, error } = await admin
    .from("course_recommendations")
    .upsert(
      {
        course_id: input.courseId,
        recommended_course_id: input.recommendedCourseId,
        kind: input.kind,
        sort_order: input.sortOrder ?? 0,
        active: input.active ?? true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "course_id,recommended_course_id,kind" },
    )
    .select("id, course_id, recommended_course_id, kind, sort_order, active")
    .single();
  if (error) throw new Error(error.message);
  return data as CourseRecommendationRow;
}

export async function deleteCourseRecommendation(
  admin: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await admin.from("course_recommendations").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
