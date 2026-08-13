import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LearningPath, Json } from "@/types/database";
import {
  LIBRARY_PAGE_SIZE,
  LIBRARY_RELATED_LIMIT,
  categoryMatchesFilter,
  parseLibraryCategory,
  parseLibraryPage,
  relatedLearningPaths,
  sanitizeLibraryQuery,
  type LibraryCategoryId,
} from "@/lib/content-factory/library-shared";

export async function getLearningPathById(admin: SupabaseClient<Database>, id: string) {
  const { data, error } = await admin.from("learning_paths").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getPublishedLearningPathBySlug(
  client: SupabaseClient<Database>,
  slug: string,
) {
  const { data, error } = await client
    .from("learning_paths")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function listPublishedLearningPaths(client: SupabaseClient<Database>, limit = 48) {
  const { data, error } = await client
    .from("learning_paths")
    .select(
      "id, slug, title, short_description, category, difficulty, tags, artwork_public_url, quality_score, published_at, creator_profile_id",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type PublishedLibraryPath = {
  id: string;
  slug: string;
  title: string;
  short_description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  tags: string[];
  artwork_public_url: string | null;
  quality_score: number | null;
  published_at: string | null;
  creator_profile_id: string | null;
  creator_name?: string | null;
};

const LIBRARY_LIST_SELECT =
  "id, slug, title, short_description, category, difficulty, tags, artwork_public_url, quality_score, published_at, creator_profile_id";

export async function listPublishedLearningLibrary(
  client: SupabaseClient<Database>,
  params: { q?: string | null; category?: string | null; page?: string | null; pageSize?: number },
): Promise<{ paths: PublishedLibraryPath[]; page: number; pageSize: number; total: number; category: LibraryCategoryId; q: string }> {
  const q = sanitizeLibraryQuery(params.q);
  const category = parseLibraryCategory(params.category);
  const page = parseLibraryPage(params.page);
  const pageSize = params.pageSize ?? LIBRARY_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const needsMemoryFilter = category !== "all";

  let query = client
    .from("learning_paths")
    .select(LIBRARY_LIST_SELECT, { count: "exact" })
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (q) {
    const { data: creators, error: creatorSearchError } = await client
      .from("creator_profiles")
      .select("id")
      .ilike("display_name", `%${q}%`)
      .limit(20);
    const creatorIds = creatorSearchError ? [] : (creators ?? []).map((row) => row.id);
    const parts = [
      `title.ilike.%${q}%`,
      `short_description.ilike.%${q}%`,
      `category.ilike.%${q}%`,
      `description.ilike.%${q}%`,
    ];
    if (creatorIds.length) parts.push(`creator_profile_id.in.(${creatorIds.join(",")})`);
    query = query.or(parts.join(","));
  }

  const bounded = needsMemoryFilter ? query.limit(200) : query.range(from, to);
  const { data, error, count } = await bounded;
  if (error) throw new Error(error.message);

  let paths = (data ?? []) as PublishedLibraryPath[];
  if (needsMemoryFilter) {
    paths = paths.filter((row) => categoryMatchesFilter(row.category, category));
  }
  const total = needsMemoryFilter ? paths.length : count ?? paths.length;
  if (needsMemoryFilter) paths = paths.slice(from, to + 1);

  const creatorIds = [...new Set(paths.map((row) => row.creator_profile_id).filter((id): id is string => Boolean(id)))];
  if (creatorIds.length) {
    const { data: creators } = await client
      .from("creator_profiles")
      .select("id, display_name")
      .in("id", creatorIds);
    const names = new Map((creators ?? []).map((row) => [row.id, row.display_name]));
    paths = paths.map((row) => ({
      ...row,
      creator_name: row.creator_profile_id ? names.get(row.creator_profile_id) ?? null : null,
    }));
  }

  return {
    paths,
    page,
    pageSize,
    total,
    category,
    q,
  };
}

export async function listRelatedPublishedLearningPaths(
  client: SupabaseClient<Database>,
  seed: { id: string; category: string; title: string },
) {
  const { data, error } = await client
    .from("learning_paths")
    .select(LIBRARY_LIST_SELECT)
    .eq("status", "published")
    .neq("id", seed.id)
    .order("published_at", { ascending: false })
    .limit(24);
  if (error) throw new Error(error.message);
  return relatedLearningPaths((data ?? []) as PublishedLibraryPath[], seed, LIBRARY_RELATED_LIMIT);
}

export async function loadLearningPathCurriculum(
  client: SupabaseClient<Database>,
  learningPathId: string,
) {
  const [{ data: sections }, { data: lessons }, { data: sources }] = await Promise.all([
    client
      .from("learning_path_sections")
      .select("*")
      .eq("learning_path_id", learningPathId)
      .order("position"),
    client
      .from("learning_path_lessons")
      .select("*")
      .eq("learning_path_id", learningPathId)
      .order("position"),
    client.from("learning_path_sources").select("*").eq("learning_path_id", learningPathId),
  ]);
  return {
    sections: sections ?? [],
    lessons: lessons ?? [],
    sources: sources ?? [],
  };
}

export async function approveLearningPath(
  admin: SupabaseClient<Database>,
  pathId: string,
): Promise<LearningPath> {
  const path = await getLearningPathById(admin, pathId);
  if (!path) throw new Error("Learning path not found.");
  if (path.status === "rejected") throw new Error("Rejected paths cannot be published.");
  if (path.status === "published") return path;
  if (!path.title.trim()) throw new Error("Title is required.");
  if (!path.slug.trim()) throw new Error("Slug is required.");
  if (!path.short_description.trim()) throw new Error("Short description is required.");
  if (!path.creator_profile_id) throw new Error("Creator profile is required before publishing.");
  if (!path.source_playlist_id) throw new Error("Source playlist is required before publishing.");

  const { data: lessons, error: lessonError } = await admin
    .from("learning_path_lessons")
    .select("id, youtube_video_id, title")
    .eq("learning_path_id", pathId);
  if (lessonError) throw new Error(lessonError.message);
  if (!lessons?.length) throw new Error("At least one lesson is required to publish.");

  const badLesson = lessons.find(
    (l) => !l.youtube_video_id || !/^[\w-]{11}$/.test(l.youtube_video_id),
  );
  if (badLesson) {
    throw new Error(
      `Lesson "${badLesson.title || badLesson.id}" is missing a valid YouTube video ID.`,
    );
  }

  const { data, error } = await admin
    .from("learning_paths")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pathId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  if (path.factory_job_id) {
    await admin
      .from("content_factory_jobs")
      .update({
        status: "completed",
        phase: "done",
        updated_at: new Date().toISOString(),
      })
      .eq("id", path.factory_job_id);
  }

  return data;
}

export async function rejectLearningPath(admin: SupabaseClient<Database>, pathId: string, reason?: string) {
  const path = await getLearningPathById(admin, pathId);
  if (!path) throw new Error("Learning path not found.");
  const warnings = Array.isArray(path.warnings) ? [...(path.warnings as Json[])] : [];
  if (reason?.trim()) warnings.push(`Rejected: ${reason.trim()}`);
  const { data, error } = await admin
    .from("learning_paths")
    .update({
      status: "rejected",
      warnings: warnings as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pathId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}
