import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { fetchPlaylist, fetchPlaylistMeta, fetchChannelMeta } from "@/lib/youtube";
import { getYoutubeApiKey } from "@/lib/env-youtube";
import {
  generateLearningPathStructure,
  generateLearningPathQuizzes,
  scoreLearningPathQuality,
} from "@/lib/content-factory/ai-pipeline";
import { generateAndStoreLearningPathArtwork } from "@/lib/content-factory/artwork";
import { uniqueLearningPathSlug, updateJobProgress } from "@/lib/content-factory/jobs";
import { researchAndUpsertCreator } from "@/lib/content-factory/creator-research";
import { reviewGeneratedLearningPath } from "@/lib/content-factory/quality";
import { isMissingRelationError } from "@/lib/schema-guard";

type Admin = SupabaseClient<Database>;

function ytWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * Process one Content Factory job end-to-end.
 * Failures mark the job failed without publishing.
 */
export async function processContentFactoryJob(admin: Admin, jobId: string): Promise<void> {
  const { data: job, error: jobError } = await admin
    .from("content_factory_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) throw new Error(jobError.message);
  if (!job) throw new Error("Job not found.");

  try {
    await updateJobProgress(admin, jobId, { status: "processing", phase: "youtube", progress: 5 });

    if (job.input_type === "topic") {
      throw new Error(
        "Topic discovery is handled by discovery runs and does not generate learning paths in Stage 1. Submit a YouTube playlist URL or ID to generate.",
      );
    }

    const playlistId = String(job.input_value);
    const apiKey = await getYoutubeApiKey();
    const meta = await fetchPlaylistMeta(playlistId, { apiKey });
    if (!meta) throw new Error("Playlist not found or unavailable.");

    const videos = await fetchPlaylist(playlistId, { apiKey });
    const seen = new Set<string>();
    const usable = videos.filter((v) => {
      if (!v.videoId || !v.title) return false;
      if (/^private video$/i.test(v.title) || /^deleted video$/i.test(v.title)) return false;
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });
    if (usable.length === 0) {
      throw new Error(
        "Playlist has no usable public videos (empty, private, or deleted items only).",
      );
    }

    await updateJobProgress(admin, jobId, { phase: "creator_research", progress: 20 });

    const channel = meta.channelId
      ? await fetchChannelMeta(meta.channelId, { apiKey })
      : null;

    let officialWebsite: string | null = null;
    let creator;
    try {
      const researched = await researchAndUpsertCreator(admin, {
        channel,
        playlistTitle: meta.title,
        playlistDescription: meta.description,
      });
      creator = researched.creator;
      officialWebsite = researched.officialWebsite;
    } catch (err) {
      const { data: fallback, error: creatorError } = await admin
        .from("creator_profiles")
        .insert({
          display_name: channel?.title ?? meta.channelTitle ?? "YouTube Creator",
          short_bio: (channel?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 400),
          expertise: [],
          teaches: "",
          credentials: "",
          relevance: "",
          youtube_channel_id: channel?.channelId ?? meta.channelId,
          youtube_channel_url: channel?.channelUrl ?? null,
          avatar_url: channel?.thumbnailUrl ?? null,
          research_status: "failed",
        })
        .select("*")
        .single();
      if (creatorError || !fallback) {
        throw new Error(err instanceof Error ? err.message : creatorError?.message ?? "Creator research failed.");
      }
      creator = fallback;
    }

    await updateJobProgress(admin, jobId, { phase: "ai_structure", progress: 40 });

    const structure = await generateLearningPathStructure({
      playlistTitle: meta.title,
      playlistDescription: meta.description,
      creatorName: creator.display_name,
      lessons: usable.map((v) => ({
        youtubeVideoId: v.videoId,
        title: v.title,
        description: v.description,
        position: v.position,
        durationSeconds: v.durationSeconds,
      })),
    });

    // Ensure every video is covered if AI omitted some.
    const covered = new Set(structure.sections.flatMap((s) => s.lessonVideoIds));
    const missing = usable.filter((v) => !covered.has(v.videoId));
    if (missing.length) {
      structure.sections.push({
        title: "Additional lessons",
        lessonVideoIds: missing.map((v) => v.videoId),
      });
      structure.warnings.push(`${missing.length} lesson(s) were not grouped by AI and were appended.`);
    }

    const slug = await uniqueLearningPathSlug(admin, structure.title);
    const { data: path, error: pathError } = await admin
      .from("learning_paths")
      .insert({
        slug,
        title: structure.title,
        description: structure.description,
        short_description: structure.short_description,
        creator_profile_id: creator.id,
        status: "draft",
        category: structure.category,
        difficulty: structure.difficulty,
        tags: structure.tags,
        learning_objectives: structure.learning_objectives,
        warnings: structure.warnings,
        source_playlist_id: playlistId,
        source_playlist_url: `https://www.youtube.com/playlist?list=${playlistId}`,
        source_playlist_title: meta.title,
        youtube_channel_id: channel?.channelId ?? meta.channelId,
        seo_title: `${structure.title} | Free Learning | DigitalSkillX`,
        seo_description: structure.short_description.slice(0, 160),
        factory_job_id: jobId,
        created_by: job.admin_id,
      })
      .select("*")
      .single();
    if (pathError) throw new Error(pathError.message);

    await admin.from("learning_path_sources").insert({
      learning_path_id: path.id,
      source_type: "youtube_playlist",
      source_url: `https://www.youtube.com/playlist?list=${playlistId}`,
      source_title: meta.title,
      source_identifier: playlistId,
      relationship: "primary",
    });
    if (officialWebsite) {
      await admin.from("learning_path_sources").insert({
        learning_path_id: path.id,
        source_type: "website",
        source_url: officialWebsite,
        source_title: "Official website",
        relationship: "supporting",
      });
    }

    const summaryById = new Map(
      structure.lesson_summaries.map((s) => [s.youtubeVideoId, s] as const),
    );
    const videoById = new Map(usable.map((v) => [v.videoId, v] as const));

    const insertedVideoIds = new Set<string>();
    for (let si = 0; si < structure.sections.length; si++) {
      const section = structure.sections[si]!;
      const { data: sectionRow, error: sectionError } = await admin
        .from("learning_path_sections")
        .insert({
          learning_path_id: path.id,
          title: section.title,
          position: si,
        })
        .select("*")
        .single();
      if (sectionError) throw new Error(sectionError.message);

      let position = 0;
      for (const videoId of section.lessonVideoIds) {
        if (insertedVideoIds.has(videoId)) continue;
        const video = videoById.get(videoId);
        if (!video) continue;
        const summary = summaryById.get(videoId);
        const { error: lessonError } = await admin.from("learning_path_lessons").insert({
          learning_path_id: path.id,
          section_id: sectionRow.id,
          title: video.title,
          original_title: video.title,
          youtube_video_id: video.videoId,
          youtube_url: ytWatchUrl(video.videoId),
          summary: summary?.summary ?? "",
          learning_objectives: summary?.learning_objectives ?? [],
          thumbnail_url: video.thumbnail,
          duration_seconds: video.durationSeconds,
          position: position++,
          source_metadata: {
            playlistId,
            sourceDescription: video.description.slice(0, 2000),
          },
        });
        if (lessonError) {
          if (/duplicate|unique/i.test(lessonError.message)) continue;
          throw new Error(lessonError.message);
        }
        insertedVideoIds.add(videoId);
      }
    }

    await updateJobProgress(admin, jobId, {
      phase: "ai_quiz",
      progress: 65,
      learning_path_id: path.id,
    });

    const lessonRows = (
      await admin
        .from("learning_path_lessons")
        .select("youtube_video_id, title, summary")
        .eq("learning_path_id", path.id)
        .order("position")
    ).data ?? [];

    const quizzes = await generateLearningPathQuizzes({
      title: structure.title,
      lessons: lessonRows.map((l) => ({
        youtubeVideoId: l.youtube_video_id,
        title: l.title,
        summary: l.summary,
      })),
    });

    await admin
      .from("learning_paths")
      .update({
        quiz_json: quizzes.quiz,
        assessment_json: quizzes.assessment,
        updated_at: new Date().toISOString(),
      })
      .eq("id", path.id);

    await updateJobProgress(admin, jobId, { phase: "artwork", progress: 80 });

    let hasArtwork = false;
    try {
      const art = await generateAndStoreLearningPathArtwork({
        learningPathId: path.id,
        title: structure.title,
        creatorName: creator.display_name,
        category: structure.category,
      });
      if (art) {
        hasArtwork = true;
        await admin
          .from("learning_paths")
          .update({
            artwork_storage_path: art.storagePath,
            artwork_public_url: art.publicUrl,
            updated_at: new Date().toISOString(),
          })
          .eq("id", path.id);
      } else {
        structure.warnings.push("Artwork skipped: OPENAI_API_KEY not configured.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      structure.warnings.push(`Artwork failed: ${message}`);
    }

    await updateJobProgress(admin, jobId, { phase: "quality", progress: 90 });

    const quality = scoreLearningPathQuality({
      lessonCount: usable.length,
      hasCreatorBio: Boolean(creator.short_bio),
      hasCreatorSources: Boolean(channel?.channelUrl),
      hasSummaries: lessonRows.some((l) => l.summary),
      hasObjectives: structure.learning_objectives.length > 0,
      quizCount: quizzes.quiz.length,
      assessmentCount: quizzes.assessment.length,
      hasArtwork,
      warningCount: structure.warnings.length,
    });

    await admin
      .from("learning_paths")
      .update({
        status: "review",
        quality_score: quality.score,
        quality_breakdown: { heuristic: quality.breakdown },
        warnings: structure.warnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", path.id);

    let qualityScore = quality.score;
    let qualityStatus: string | null = null;
    try {
      const qc = await reviewGeneratedLearningPath(admin, path.id, { heuristic: quality.breakdown });
      qualityScore = qc.review.overallScore;
      qualityStatus = qc.review.status;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      structure.warnings.push(`Quality review unavailable: ${message}`);
      await admin
        .from("learning_paths")
        .update({
          warnings: structure.warnings,
          updated_at: new Date().toISOString(),
        })
        .eq("id", path.id);
    }

    await updateJobProgress(admin, jobId, {
      status: "waiting_review",
      phase: "waiting_review",
      progress: 100,
      learning_path_id: path.id,
      completed_at: new Date().toISOString(),
      result_snapshot: {
        lessonCount: usable.length,
        qualityScore,
        qualityStatus,
        slug,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isMissingRelationError(message)) {
      await updateJobProgress(admin, jobId, {
        status: "failed",
        phase: "failed",
        error_message: "Content Factory tables missing — apply migration 0042.",
        last_error: message,
        completed_at: new Date().toISOString(),
      });
      return;
    }
    await updateJobProgress(admin, jobId, {
      status: "failed",
      phase: "failed",
      error_message: message,
      last_error: message,
      completed_at: new Date().toISOString(),
    });
  }
}
