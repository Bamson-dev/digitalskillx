import "server-only";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  getPublishedLearningPathBySlug,
  listPublishedLearningLibrary,
  listRelatedPublishedLearningPaths,
  loadLearningPathCurriculum,
} from "@/lib/content-factory/learning-paths";
import {
  listPublishedAuthorityArticles,
  listPublishedAuthorityForPath,
  getPublishedAuthorityBySlug,
} from "@/lib/content-factory/authority-engine";
import {
  parseLibraryCategory,
  parseLibraryPage,
  sanitizeLibraryQuery,
  normalizeLibraryCategory,
  categoryMatchesFilter,
  libraryCategoryLabel,
} from "@/lib/content-factory/library-shared";
import {
  CATEGORY_HUB_MIN_PATHS,
  categoryHasEnoughPublished,
  isLibraryCategoryHubSlug,
} from "@/lib/content-factory/seo-shared";
import type { LibraryCategoryId } from "@/lib/content-factory/library-shared";
import type { AuthorityContentType } from "@/lib/content-factory/authority-shared";
import { AUTHORITY_PATH_READING_LIMIT } from "@/lib/content-factory/authority-shared";

export const getCachedPublishedLibrary = unstable_cache(
  async (q: string, category: string, page: string) => {
    return listPublishedLearningLibrary(createAnonClient(), { q, category, page });
  },
  ["learn-library-v1"],
  { revalidate: 300 },
);

export const getCachedPublishedLearningPath = unstable_cache(
  async (slug: string) => {
    const supabase = createAnonClient();
    const path = await getPublishedLearningPathBySlug(supabase, slug);
    if (!path) return null;
    const curriculum = await loadLearningPathCurriculum(supabase, path.id);
    let creator: {
      display_name: string;
      short_bio: string;
      teaches: string;
      expertise: string[];
      relevance: string;
      youtube_channel_url: string | null;
    } | null = null;
    if (path.creator_profile_id) {
      const { data } = await supabase
        .from("creator_profiles")
        .select("display_name, short_bio, teaches, expertise, relevance, youtube_channel_url")
        .eq("id", path.creator_profile_id)
        .maybeSingle();
      creator = data;
    }
    let related: Awaited<ReturnType<typeof listRelatedPublishedLearningPaths>> = [];
    try {
      related = await listRelatedPublishedLearningPaths(supabase, {
        id: path.id,
        category: path.category,
        title: path.title,
      });
    } catch {
      related = [];
    }
    let recommendedCourse: { id: string; title: string; price_ngn: number | null } | null = null;
    if (path.recommended_course_id) {
      const { data: course } = await supabase
        .from("courses")
        .select("id, title, visibility, price_ngn")
        .eq("id", path.recommended_course_id)
        .eq("visibility", "published")
        .maybeSingle();
      if (course?.id && course.title && course.visibility === "published") {
        recommendedCourse = {
          id: course.id,
          title: course.title,
          price_ngn: typeof course.price_ngn === "number" ? course.price_ngn : null,
        };
      }
    }
    let recommendedReading: Awaited<ReturnType<typeof listPublishedAuthorityForPath>> = [];
    try {
      recommendedReading = await listPublishedAuthorityForPath(
        supabase,
        path.id,
        AUTHORITY_PATH_READING_LIMIT,
      );
    } catch {
      recommendedReading = [];
    }
    return { path, curriculum, creator, related, recommendedCourse, recommendedReading };
  },
  ["learn-path-v2"],
  { revalidate: 300 },
);

export function libraryCacheKey(searchParams: { q?: string; category?: string; page?: string }) {
  return {
    q: sanitizeLibraryQuery(searchParams.q),
    category: parseLibraryCategory(searchParams.category),
    page: String(parseLibraryPage(searchParams.page)),
  };
}

export const getCachedPublishedAuthorityLibrary = unstable_cache(
  async () => {
    return listPublishedAuthorityArticles(createAnonClient(), 48);
  },
  ["authority-library-v1"],
  { revalidate: 300 },
);

export const getCachedPublishedAuthorityArticle = unstable_cache(
  async (slug: string) => {
    const supabase = createAnonClient();
    const article = await getPublishedAuthorityBySlug(supabase, slug);
    if (!article || article.status !== "published") return null;
    let path_title: string | null = null;
    let path_slug: string | null = null;
    if (article.learning_path_id) {
      const { data: path } = await supabase
        .from("learning_paths")
        .select("title, slug, status")
        .eq("id", article.learning_path_id)
        .maybeSingle();
      if (path?.status === "published") {
        path_title = path.title;
        path_slug = path.slug;
      }
    }
    return {
      ...article,
      content_type: article.content_type as AuthorityContentType,
      path_title,
      path_slug,
    };
  },
  ["authority-article-v1"],
  { revalidate: 300 },
);

export const getCachedCategoryHub = unstable_cache(
  async (categoryId: string) => {
    if (!isLibraryCategoryHubSlug(categoryId)) return null;
    const supabase = createAnonClient();
    const { data, error } = await supabase
      .from("learning_paths")
      .select(
        "id, slug, title, short_description, category, difficulty, artwork_public_url, creator_profile_id, certificate_enabled, certificate_price_ngn",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const matching = (data ?? []).filter((row) =>
      categoryMatchesFilter(row.category, categoryId as LibraryCategoryId),
    );
    if (!categoryHasEnoughPublished(matching.length, CATEGORY_HUB_MIN_PATHS)) return null;

    const creatorIds = Array.from(
      new Set(matching.map((row) => row.creator_profile_id).filter(Boolean)),
    ) as string[];
    const names = new Map<string, string>();
    if (creatorIds.length) {
      const { data: creators } = await supabase
        .from("creator_profiles")
        .select("id, display_name")
        .in("id", creatorIds);
      for (const creator of creators ?? []) {
        if (creator.display_name) names.set(creator.id, creator.display_name);
      }
    }

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const cat = normalizeLibraryCategory(row.category);
      if (cat === "all" || cat === "other") continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }

    const relatedCategories = Array.from(counts.entries())
      .filter(([id, count]) => id !== categoryId && categoryHasEnoughPublished(count))
      .map(([id, count]) => ({
        id: id as Exclude<LibraryCategoryId, "all">,
        label: libraryCategoryLabel(id as LibraryCategoryId),
        count,
      }))
      .slice(0, 6);

    let authorityArticles: Array<{
      id: string;
      title: string;
      slug: string;
      content_type: string;
      description: string;
    }> = [];
    try {
      const published = await listPublishedAuthorityArticles(supabase, 80);
      authorityArticles = published
        .filter((row) => categoryMatchesFilter(row.category, categoryId as LibraryCategoryId))
        .slice(0, 6)
        .map((row) => ({
          id: row.id,
          title: row.title,
          slug: row.slug,
          content_type: row.content_type,
          description: row.description,
        }));
    } catch {
      authorityArticles = [];
    }

    return {
      category: categoryId as Exclude<LibraryCategoryId, "all">,
      paths: matching.map((row) => ({
        id: row.id,
        slug: row.slug,
        title: row.title,
        short_description: row.short_description,
        difficulty: row.difficulty,
        artwork_public_url: row.artwork_public_url,
        creator_name: row.creator_profile_id ? names.get(row.creator_profile_id) ?? null : null,
        certificate_enabled: row.certificate_enabled === true,
        certificate_price_ngn: row.certificate_price_ngn ?? null,
      })),
      relatedCategories,
      authorityArticles,
    };
  },
  ["learn-category-hub-v2"],
  { revalidate: 300 },
);
