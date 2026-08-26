import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyLearningPathArtworkPipeline } from "@/lib/content-factory/artwork-apply";
import { fetchPlaylistMeta } from "@/lib/youtube";
import { isMissingRelationError, isMissingColumnError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

async function resolveYoutubeThumbnailForPath(
  admin: Admin,
  path: { id: string; source_playlist_id?: string | null },
): Promise<string | null> {
  const playlistId = path.source_playlist_id?.trim();
  if (playlistId) {
    try {
      const meta = await fetchPlaylistMeta(playlistId);
      if (meta?.thumbnailUrl?.trim()) return meta.thumbnailUrl.trim();
    } catch {
      // fall through to first-lesson thumbnail
    }
  }

  const { data: lesson } = await admin
    .from("learning_path_lessons")
    .select("thumbnail_url, youtube_video_id")
    .eq("learning_path_id", path.id)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();

  const lessonThumb = lesson?.thumbnail_url?.trim();
  if (lessonThumb) return lessonThumb;

  const videoId = lesson?.youtube_video_id?.trim();
  if (videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  return null;
}

/**
 * Fill blank /learn covers for published paths.
 * Priority: OpenAI → YouTube thumbnail → category_fallback status (UI gradient).
 * Skips paths that already have a valid generated/source cover.
 */
export async function backfillMissingLearningPathArtwork(
  admin: Admin,
  limit = 8,
): Promise<{ updated: number; skipped: number; errors: string[] }> {
  let query = admin
    .from("learning_paths")
    .select(
      "id, title, category, difficulty, description, short_description, learning_objectives, tags, source_playlist_id, creator_profile_id, artwork_public_url, artwork_storage_path, artwork_status, artwork_source",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(Math.max(1, Math.min(20, limit)));

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) return { updated: 0, skipped: 0, errors: [] };
    // Older schema without artwork_status — fall back to URL-only select.
    if (isMissingColumnError(error.message)) {
      return backfillLegacy(admin, limit);
    }
    throw new Error(error.message);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const path of data ?? []) {
    const status = (path as { artwork_status?: string | null }).artwork_status;
    const source = (path as { artwork_source?: string | null }).artwork_source;
    const hasUsable =
      Boolean(path.artwork_public_url) &&
      (status === "generated" ||
        status === "source_thumbnail" ||
        source === "openai" ||
        source === "youtube" ||
        source === "manual" ||
        (!status && Boolean(path.artwork_public_url)));

    // Keep valid covers. Category-only rows (no public URL) may still upgrade via YouTube/AI.
    if (hasUsable) {
      skipped += 1;
      continue;
    }

    // Blank / failed / missing / processing stuck / category without URL — attempt pipeline.
    if (
      path.artwork_public_url &&
      status !== "failed" &&
      status !== "missing" &&
      status !== "processing" &&
      status !== "retrying" &&
      status !== "category_fallback"
    ) {
      skipped += 1;
      continue;
    }

    let creatorName = "Creator";
    if (path.creator_profile_id) {
      const { data: creator } = await admin
        .from("creator_profiles")
        .select("display_name")
        .eq("id", path.creator_profile_id)
        .maybeSingle();
      if (creator?.display_name) creatorName = creator.display_name;
    }

    let youtubeThumb: string | null = null;
    try {
      youtubeThumb = await resolveYoutubeThumbnailForPath(admin, path);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    try {
      const fields = await applyLearningPathArtworkPipeline({
        admin,
        learningPathId: path.id,
        title: path.title,
        category: path.category || "skills",
        creatorName,
        description: path.description,
        shortDescription: path.short_description,
        difficulty: path.difficulty,
        learningObjectives: Array.isArray(path.learning_objectives)
          ? (path.learning_objectives as string[])
          : null,
        tags: Array.isArray(path.tags) ? (path.tags as string[]) : null,
        youtubeThumbnailUrl: youtubeThumb,
      });
      if (fields.artwork_public_url || fields.artwork_status === "category_fallback") {
        updated += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { updated, skipped, errors: errors.slice(0, 8) };
}

async function backfillLegacy(admin: Admin, limit: number) {
  const { data, error } = await admin
    .from("learning_paths")
    .select("id, title, category, source_playlist_id, creator_profile_id, artwork_public_url")
    .eq("status", "published")
    .or("artwork_public_url.is.null,artwork_public_url.eq.")
    .order("published_at", { ascending: false })
    .limit(Math.max(1, Math.min(20, limit)));
  if (error) {
    if (isMissingRelationError(error.message)) return { updated: 0, skipped: 0, errors: [] };
    throw new Error(error.message);
  }

  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const path of data ?? []) {
    if (path.artwork_public_url) {
      skipped += 1;
      continue;
    }
    let creatorName = "Creator";
    if (path.creator_profile_id) {
      const { data: creator } = await admin
        .from("creator_profiles")
        .select("display_name")
        .eq("id", path.creator_profile_id)
        .maybeSingle();
      if (creator?.display_name) creatorName = creator.display_name;
    }
    let youtubeThumb: string | null = null;
    try {
      youtubeThumb = await resolveYoutubeThumbnailForPath(admin, path);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
    try {
      const fields = await applyLearningPathArtworkPipeline({
        admin,
        learningPathId: path.id,
        title: path.title,
        category: path.category || "skills",
        creatorName,
        youtubeThumbnailUrl: youtubeThumb,
      });
      if (fields.artwork_public_url || fields.artwork_status === "category_fallback") updated += 1;
      else skipped += 1;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { updated, skipped, errors: errors.slice(0, 8) };
}
