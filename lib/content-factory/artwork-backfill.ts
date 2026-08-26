import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { generateAndStoreLearningPathArtwork } from "@/lib/content-factory/artwork";
import { fetchPlaylistMeta } from "@/lib/youtube";
import { isMissingRelationError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

/**
 * Fill blank /learn covers: prefer OpenAI artwork when configured, otherwise
 * the YouTube playlist thumbnail so cards are never empty.
 */
export async function backfillMissingLearningPathArtwork(
  admin: Admin,
  limit = 8,
): Promise<{ updated: number; skipped: number; errors: string[] }> {
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

    try {
      const art = await generateAndStoreLearningPathArtwork({
        learningPathId: path.id,
        title: path.title,
        creatorName,
        category: path.category || "skills",
      });
      if (art?.publicUrl) {
        await admin
          .from("learning_paths")
          .update({
            artwork_storage_path: art.storagePath,
            artwork_public_url: art.publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", path.id);
        updated += 1;
        continue;
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }

    const playlistId = path.source_playlist_id?.trim();
    if (!playlistId) {
      skipped += 1;
      continue;
    }

    try {
      const meta = await fetchPlaylistMeta(playlistId);
      const url = meta?.thumbnailUrl ?? null;
      if (!url) {
        skipped += 1;
        continue;
      }
      await admin
        .from("learning_paths")
        .update({
          artwork_public_url: url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", path.id);
      updated += 1;
    } catch (err) {
      skipped += 1;
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { updated, skipped, errors: errors.slice(0, 5) };
}
