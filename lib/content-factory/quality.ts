import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { getDeepseekApiKey, getDeepseekModel } from "@/lib/env-deepseek";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { loadCreatorResearchBundle } from "@/lib/content-factory/creator-research";
import { getLearningPathById, loadLearningPathCurriculum } from "@/lib/content-factory/learning-paths";
import { extractJsonValue } from "@/lib/content-factory/qualify-shared";
import {
  asStoredQualityReview,
  buildQualitySystemPrompt,
  buildQualityUserPrompt,
  isTransientQualityError,
  mergeQualityReview,
  parseQualityReviewResponse,
  qualityMaxLessons,
  qualityRetries,
  qualityTimeoutMs,
  runDeterministicQualityChecks,
  type ParsedAiQualityReview,
  type QualityReviewInput,
  type StoredQualityReview,
} from "@/lib/content-factory/quality-shared";

type Admin = SupabaseClient<Database>;

function envMaxLessons() {
  return qualityMaxLessons(process.env.CONTENT_FACTORY_QUALITY_MAX_LESSONS);
}

function envTimeoutMs() {
  return qualityTimeoutMs(process.env.CONTENT_FACTORY_QUALITY_TIMEOUT_MS);
}

function envRetries() {
  return qualityRetries(process.env.CONTENT_FACTORY_QUALITY_RETRIES);
}

export function toQualityReviewInput(params: {
  path: {
    title: string;
    slug: string;
    description: string;
    short_description: string;
    seo_title: string | null;
    seo_description: string | null;
    learning_objectives: string[];
    category: string;
    source_playlist_id: string | null;
    source_playlist_url: string | null;
  };
  sections: Array<{ title: string; position: number }>;
  lessons: Array<{
    title: string;
    original_title: string;
    youtube_video_id: string;
    youtube_url: string;
    summary: string;
    position: number;
  }>;
  sources: Array<{ source_type: string; source_url: string; source_title: string }>;
  creator: {
    display_name: string;
    short_bio: string;
    teaches: string;
    credentials: string;
    research_status: string;
    youtube_channel_url: string | null;
  } | null;
  creatorQualityScore: number | null;
  creatorFacts: Array<{ claim: string; sourceTitle: string }>;
  maxLessons?: number;
}): QualityReviewInput {
  return {
    title: params.path.title,
    slug: params.path.slug,
    description: params.path.description,
    shortDescription: params.path.short_description,
    seoTitle: params.path.seo_title,
    seoDescription: params.path.seo_description,
    learningObjectives: params.path.learning_objectives,
    category: params.path.category,
    sourcePlaylistId: params.path.source_playlist_id,
    sourcePlaylistUrl: params.path.source_playlist_url,
    sections: params.sections,
    lessons: params.lessons.map((lesson) => ({
      title: lesson.title,
      originalTitle: lesson.original_title,
      youtubeVideoId: lesson.youtube_video_id,
      youtubeUrl: lesson.youtube_url,
      summary: lesson.summary,
      position: lesson.position,
    })),
    sources: params.sources.map((source) => ({
      sourceType: source.source_type,
      sourceUrl: source.source_url,
      sourceTitle: source.source_title,
    })),
    creator: params.creator
      ? {
          displayName: params.creator.display_name,
          shortBio: params.creator.short_bio,
          teaches: params.creator.teaches,
          credentials: params.creator.credentials,
          researchStatus: params.creator.research_status,
          youtubeChannelUrl: params.creator.youtube_channel_url,
          qualityScore: params.creatorQualityScore,
        }
      : null,
    creatorFacts: params.creatorFacts,
    maxLessons: params.maxLessons ?? envMaxLessons(),
  };
}

async function callDeepseekQuality(input: QualityReviewInput): Promise<unknown> {
  const apiKey = await getDeepseekApiKey();
  const model = await getDeepseekModel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), envTimeoutMs());
  let res: Response;
  try {
    res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        max_tokens: 1600,
        temperature: 0.1,
        messages: [
          { role: "system", content: buildQualitySystemPrompt() },
          { role: "user", content: buildQualityUserPrompt(input) },
        ],
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("DeepSeek request failed (timeout)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek returned empty content.");
  try {
    return extractJsonValue(content);
  } catch {
    throw new Error("malformed_json");
  }
}

async function reviewWithRetry(input: QualityReviewInput): Promise<ParsedAiQualityReview> {
  const retries = envRetries();
  let lastError = "Quality review failed.";
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const raw = await callDeepseekQuality(input);
      return parseQualityReviewResponse(raw);
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Quality review failed.";
      const lower = lastError.toLowerCase();
      const malformed =
        lower.includes("malformed") ||
        lower.includes("invalid_") ||
        lower.includes("missing_fields");
      if (malformed && attempt >= 2) throw err;
      if (!isTransientQualityError(lastError) && !malformed) throw err;
    }
  }
  throw new Error(lastError);
}

export async function reviewGeneratedLearningPath(
  admin: Admin,
  pathId: string,
  options?: { heuristic?: Record<string, number>; force?: boolean },
): Promise<{ review: StoredQualityReview; reused: boolean }> {
  if (!contentFactoryEnabled()) {
    throw new Error("Content Factory is disabled.");
  }

  const path = await getLearningPathById(admin, pathId);
  if (!path) throw new Error("Learning path not found.");

  const existing = asStoredQualityReview(path.quality_breakdown);
  if (existing && !options?.force) {
    return { review: existing, reused: true };
  }

  const curriculum = await loadLearningPathCurriculum(admin, pathId);
  let creator = null;
  let creatorQualityScore: number | null = null;
  let creatorFacts: Array<{ claim: string; sourceTitle: string }> = [];
  if (path.creator_profile_id) {
    const bundle = await loadCreatorResearchBundle(admin, path.creator_profile_id);
    creator = bundle?.profile ?? null;
    creatorQualityScore = bundle?.qualityScore ?? null;
    creatorFacts = (bundle?.facts ?? []).map((row) => ({
      claim: row.source_title,
      sourceTitle: row.source_title,
    }));
  }

  const input = toQualityReviewInput({
    path,
    sections: curriculum.sections,
    lessons: curriculum.lessons,
    sources: curriculum.sources,
    creator,
    creatorQualityScore,
    creatorFacts,
  });

  const deterministic = runDeterministicQualityChecks(input);
  let ai: ParsedAiQualityReview | null = null;
  if (deterministic.shouldCallAi) {
    try {
      ai = await reviewWithRetry(input);
    } catch {
      ai = null;
    }
  }

  const review = mergeQualityReview({
    deterministic,
    ai,
    heuristic: options?.heuristic,
  });

  const warningLines = review.issues.map((issue) => `${issue.severity.toUpperCase()}: ${issue.field}: ${issue.message}`);
  const existingWarnings = Array.isArray(path.warnings)
    ? path.warnings.filter((row): row is string => typeof row === "string" && !row.startsWith("ERROR:") && !row.startsWith("WARNING:"))
    : [];

  const { preserveSeoGrowthOnQualityWrite } = await import("@/lib/content-factory/seo-shared");
  const qualityPayload = preserveSeoGrowthOnQualityWrite(
    path.quality_breakdown,
    review as unknown as Record<string, unknown>,
  );

  await admin
    .from("learning_paths")
    .update({
      quality_score: review.overallScore,
      quality_breakdown: qualityPayload as unknown as Json,
      warnings: [...existingWarnings, ...warningLines] as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pathId);

  return { review, reused: false };
}
