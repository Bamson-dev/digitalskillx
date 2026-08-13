import "server-only";
import { unstable_cache } from "next/cache";
import { createAnonClient } from "@/lib/supabase/anon";
import {
  getPublishedLearningPathBySlug,
  listPublishedLearningLibrary,
  listRelatedPublishedLearningPaths,
  loadLearningPathCurriculum,
} from "@/lib/content-factory/learning-paths";
import { parseLibraryCategory, parseLibraryPage, sanitizeLibraryQuery } from "@/lib/content-factory/library-shared";

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
    let recommendedCourse: { id: string; title: string } | null = null;
    if (path.recommended_course_id) {
      const { data: course } = await supabase
        .from("courses")
        .select("id, title, visibility")
        .eq("id", path.recommended_course_id)
        .eq("visibility", "published")
        .maybeSingle();
      if (course?.id && course.title) {
        recommendedCourse = { id: course.id, title: course.title };
      }
    }
    return { path, curriculum, creator, related, recommendedCourse };
  },
  ["learn-path-v1"],
  { revalidate: 300 },
);

export function libraryCacheKey(searchParams: { q?: string; category?: string; page?: string }) {
  return {
    q: sanitizeLibraryQuery(searchParams.q),
    category: parseLibraryCategory(searchParams.category),
    page: String(parseLibraryPage(searchParams.page)),
  };
}
