import { NextResponse } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { isUuid } from "@/lib/learn-certificate-shared";
import { applyLearningPathArtworkPipeline } from "@/lib/content-factory/artwork-apply";
import { fetchPlaylistMeta } from "@/lib/youtube";
import { revalidatePath } from "next/cache";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!contentFactoryEnabled()) {
      return NextResponse.json({ error: "Content Factory disabled." }, { status: 403 });
    }
    const limited = await rateLimitedResponse(request, "admin-path-artwork", 30);
    if (limited) return limited;

    await bootstrapRuntimeSecrets();
    const auth = await requireAdminApiAuth({ lite: true });
    if ("error" in auth) return auth.error;

    const body = (await request.json().catch(() => null)) as {
      pathId?: string;
      preferYoutube?: boolean;
    } | null;
    const pathId = body?.pathId?.trim() ?? "";
    if (!isUuid(pathId)) {
      return NextResponse.json({ error: "Invalid learning path." }, { status: 400 });
    }

    const admin = auth.admin;
    const { data: path, error } = await admin
      .from("learning_paths")
      .select(
        "id, slug, title, category, difficulty, description, short_description, learning_objectives, tags, source_playlist_id, creator_profile_id",
      )
      .eq("id", pathId)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!path) return NextResponse.json({ error: "Learning path not found." }, { status: 404 });

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
      } catch {
        youtubeThumb = null;
      }
    }

    if (body?.preferYoutube) {
      if (!youtubeThumb) {
        return NextResponse.json({ error: "No YouTube thumbnail available for this path." }, { status: 400 });
      }
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("learning_paths")
        .update({
          artwork_public_url: youtubeThumb,
          artwork_storage_path: null,
          artwork_status: "source_thumbnail",
          artwork_source: "youtube",
          artwork_error: null,
          artwork_updated_at: now,
          updated_at: now,
        } as never)
        .eq("id", pathId);
      if (updateError) {
        await admin
          .from("learning_paths")
          .update({ artwork_public_url: youtubeThumb, updated_at: now })
          .eq("id", pathId);
      }
      revalidatePath("/learn");
      revalidatePath(`/learn/${path.slug}`);
      return NextResponse.json({ ok: true, status: "source_thumbnail", url: youtubeThumb });
    }

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
      skipIfHasValidCover: false,
    });

    revalidatePath("/learn");
    revalidatePath(`/learn/${path.slug}`);
    return NextResponse.json({
      ok: true,
      status: fields.artwork_status,
      source: fields.artwork_source,
      url: fields.artwork_public_url,
      error: fields.artwork_error,
    });
  } catch (err) {
    console.error("[admin-artwork]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Artwork update failed." },
      { status: 500 },
    );
  }
}
