import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  hasValidArtwork,
  verifyPathForPublication,
  type PublishVerificationResult,
} from "@/lib/content-factory/library-build/library-build-shared";
import { approveLearningPath } from "@/lib/content-factory/learning-paths";

type Admin = SupabaseClient<Database>;

export async function loadPathPublishContext(admin: Admin, pathId: string) {
  const { data: path, error } = await admin.from("learning_paths").select("*").eq("id", pathId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!path) return null;
  const { data: lessons } = await admin
    .from("learning_path_lessons")
    .select("id, title, youtube_video_id, position")
    .eq("learning_path_id", pathId)
    .order("position");
  const { data: published } = await admin
    .from("learning_paths")
    .select("title")
    .eq("status", "published")
    .neq("id", pathId)
    .limit(200);
  return {
    path,
    lessons: lessons ?? [],
    existingPublishedTitles: (published ?? []).map((row) => row.title),
  };
}

export async function runPublishVerificationGate(
  admin: Admin,
  pathId: string,
  minQualityScore?: number,
): Promise<PublishVerificationResult & { pathId: string }> {
  const ctx = await loadPathPublishContext(admin, pathId);
  if (!ctx) {
    return { ok: false, failedChecks: ["not_found"], reasons: ["Learning path not found."], pathId };
  }
  const result = verifyPathForPublication({
    path: ctx.path,
    lessons: ctx.lessons,
    existingPublishedTitles: ctx.existingPublishedTitles,
    minQualityScore,
  });
  return { ...result, pathId };
}

export async function markPathVerificationFailed(
  admin: Admin,
  pathId: string,
  result: PublishVerificationResult,
) {
  try {
    await admin
      .from("learning_paths")
      .update({
        verification_status: "verification_failed",
        verification_errors: result.failedChecks as unknown as Json,
        verification_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pathId);
  } catch (err) {
    if (isMissingRelationError(err instanceof Error ? err.message : String(err))) return;
    throw err;
  }
}

export async function markPathVerificationPassed(admin: Admin, pathId: string) {
  try {
    await admin
      .from("learning_paths")
      .update({
        verification_status: "passed",
        verification_errors: [] as unknown as Json,
        verification_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", pathId);
  } catch {
    /* columns may be missing on older DBs */
  }
}

export async function approveLearningPathWithVerification(
  admin: Admin,
  pathId: string,
  minQualityScore?: number,
) {
  const verification = await runPublishVerificationGate(admin, pathId, minQualityScore);
  if (!verification.ok) {
    await markPathVerificationFailed(admin, pathId, verification);
    throw new Error(verification.reasons[0] ?? "Publication verification failed.");
  }
  const path = await approveLearningPath(admin, pathId);
  await markPathVerificationPassed(admin, pathId);
  return path;
}

export { hasValidArtwork, verifyPathForPublication };
