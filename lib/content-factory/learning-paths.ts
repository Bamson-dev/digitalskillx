import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LearningPath, Json } from "@/types/database";

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
