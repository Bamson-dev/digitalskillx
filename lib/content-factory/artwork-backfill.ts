import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { applyLearningPathArtworkPipeline } from "@/lib/content-factory/artwork-apply";
import { fetchPlaylistMeta } from "@/lib/youtube";
import { isMissingRelationError, isMissingColumnError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

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

    if (hasUsable || status === "category_fallback") {
      // category_fallback still counts as handled (UI shows gradient); skip regen spam.
      if (hasUsable || status === "category_fallback") {
        skipped += 1;
        continue;
      }
    }

    // Blank / failed / missing / processing stuck — attempt pipeline.
    if (
      path.artwork_public_url &&
      status !== "failed" &&
      status !== "missing" &&
      status !== "processing" &&
      status !== "retrying"
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
    const playlistId = path.source_playlist_id?.trim();
    if (playlistId) {
      try {
        const meta = await fetchPlaylistMeta(playlistId);
        youtubeThumb = meta?.thumbnailUrl ?? null;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
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
    if (path.source_playlist_id?.trim()) {
      try {
        const meta = await fetchPlaylistMeta(path.source_playlist_id.trim());
        youtubeThumb = meta?.thumbnailUrl ?? null;
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
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
