import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  generateAndStoreLearningPathArtwork,
  type LearningPathArtworkResult,
} from "@/lib/content-factory/artwork";
import type { ArtworkSource, ArtworkStatus } from "@/lib/content-factory/artwork-shared";
import { isMissingColumnError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

export type ArtworkPersistFields = {
  artwork_storage_path: string | null;
  artwork_public_url: string | null;
  artwork_status: ArtworkStatus;
  artwork_source: ArtworkSource | null;
  artwork_error: string | null;
  artwork_updated_at: string;
  updated_at: string;
};

export function artworkFieldsFromResult(result: LearningPathArtworkResult): ArtworkPersistFields {
  const now = new Date().toISOString();
  return {
    artwork_storage_path: result.storagePath,
    artwork_public_url: result.publicUrl,
    artwork_status: result.status,
    artwork_source: result.source,
    artwork_error: result.error,
    artwork_updated_at: now,
    updated_at: now,
  };
}

export async function persistLearningPathArtwork(
  admin: Admin,
  pathId: string,
  fields: ArtworkPersistFields,
) {
  const full = await admin.from("learning_paths").update(fields).eq("id", pathId);
  if (!full.error) return;

  if (!isMissingColumnError(full.error.message)) {
    throw new Error(full.error.message);
  }

  // Older DBs without artwork_status columns — still persist URL/path.
  const legacy = await admin
    .from("learning_paths")
    .update({
      artwork_storage_path: fields.artwork_storage_path,
      artwork_public_url: fields.artwork_public_url,
      updated_at: fields.updated_at,
    })
    .eq("id", pathId);
  if (legacy.error) throw new Error(legacy.error.message);
}

export async function applyLearningPathArtworkPipeline(params: {
  admin: Admin;
  learningPathId: string;
  title: string;
  category: string;
  creatorName?: string;
  description?: string | null;
  shortDescription?: string | null;
  difficulty?: string | null;
  learningObjectives?: string[] | null;
  tags?: string[] | null;
  youtubeThumbnailUrl?: string | null;
  /** When true, skip OpenAI if a usable cover already exists. */
  skipIfHasValidCover?: boolean;
}): Promise<ArtworkPersistFields> {
  const { admin, learningPathId } = params;

  if (params.skipIfHasValidCover) {
    const { data: existing } = await admin
      .from("learning_paths")
      .select("artwork_public_url, artwork_storage_path, artwork_status, artwork_source")
      .eq("id", learningPathId)
      .maybeSingle();
    const status = (existing as { artwork_status?: string | null } | null)?.artwork_status;
    const source = (existing as { artwork_source?: string | null } | null)?.artwork_source;
    if (
      existing?.artwork_public_url &&
      (status === "generated" ||
        status === "source_thumbnail" ||
        source === "openai" ||
        source === "youtube" ||
        source === "manual")
    ) {
      const now = new Date().toISOString();
      return {
        artwork_storage_path: existing.artwork_storage_path,
        artwork_public_url: existing.artwork_public_url,
        artwork_status: (status as ArtworkStatus) || "generated",
        artwork_source: (source as ArtworkSource) || "openai",
        artwork_error: null,
        artwork_updated_at: now,
        updated_at: now,
      };
    }
  }

  await persistLearningPathArtwork(
    admin,
    learningPathId,
    artworkFieldsFromResult({
      storagePath: null,
      publicUrl: null,
      status: "processing",
      source: null,
      error: null,
    }),
  );

  const ai = await generateAndStoreLearningPathArtwork({
    learningPathId,
    title: params.title,
    creatorName: params.creatorName,
    category: params.category || "skills",
    description: params.description,
    shortDescription: params.shortDescription,
    difficulty: params.difficulty,
    learningObjectives: params.learningObjectives,
    tags: params.tags,
  });

  if (ai.status === "generated" && ai.publicUrl) {
    const fields = artworkFieldsFromResult(ai);
    await persistLearningPathArtwork(admin, learningPathId, fields);
    return fields;
  }

  const youtubeUrl = params.youtubeThumbnailUrl?.trim() || null;
  if (youtubeUrl) {
    const now = new Date().toISOString();
    const fields: ArtworkPersistFields = {
      artwork_storage_path: null,
      artwork_public_url: youtubeUrl,
      artwork_status: "source_thumbnail",
      artwork_source: "youtube",
      artwork_error: ai.error,
      artwork_updated_at: now,
      updated_at: now,
    };
    await persistLearningPathArtwork(admin, learningPathId, fields);
    return fields;
  }

  const now = new Date().toISOString();
  const fields: ArtworkPersistFields = {
    artwork_storage_path: null,
    artwork_public_url: null,
    artwork_status: "category_fallback",
    artwork_source: "category",
    artwork_error: ai.error ?? "No OpenAI artwork and no YouTube thumbnail available.",
    artwork_updated_at: now,
    updated_at: now,
  };
  await persistLearningPathArtwork(admin, learningPathId, fields);
  return fields;
}
