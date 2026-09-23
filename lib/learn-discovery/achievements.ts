import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  evaluateEarnedAchievementCodes,
  newlyEarnedAchievementCodes,
  type LearnerAchievementMetrics,
} from "@/lib/learn-discovery/achievements-shared";
import { computeLearnerAchievementMetrics } from "@/lib/learn-discovery/learner-dashboard";

type Admin = SupabaseClient<Database>;

export async function loadLearnerAchievements(admin: Admin, studentId: string) {
  const { data, error } = await admin
    .from("learn_learner_achievements")
    .select("achievement_code, earned_at, definition:learn_achievement_definitions(title, description, sort_order)")
    .eq("student_id", studentId)
    .order("earned_at", { ascending: false });
  if (error) {
    if (isMissingRelationError(error.message)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    code: row.achievement_code,
    title: (row.definition as { title?: string } | null)?.title ?? row.achievement_code,
    description: (row.definition as { description?: string } | null)?.description ?? "",
    earnedAt: row.earned_at,
    sortOrder: (row.definition as { sort_order?: number } | null)?.sort_order ?? 0,
  }));
}

export async function grantLearnerAchievements(
  admin: Admin,
  studentId: string,
  metrics?: LearnerAchievementMetrics,
): Promise<string[]> {
  const computed = metrics ?? (await computeLearnerAchievementMetrics(admin, studentId));

  const { data: existing, error: existingError } = await admin
    .from("learn_learner_achievements")
    .select("achievement_code")
    .eq("student_id", studentId);
  if (existingError && !isMissingRelationError(existingError.message)) {
    throw new Error(existingError.message);
  }

  const toAward = newlyEarnedAchievementCodes(
    computed,
    (existing ?? []).map((row) => row.achievement_code),
  );
  if (!toAward.length) return [];

  const rows = toAward.map((code) => ({
    student_id: studentId,
    achievement_code: code,
    earned_at: new Date().toISOString(),
  }));

  const { error } = await admin.from("learn_learner_achievements").upsert(rows as never, {
    onConflict: "student_id,achievement_code",
    ignoreDuplicates: true,
  });
  if (error && !/duplicate|unique/i.test(error.message) && !isMissingRelationError(error.message)) {
    throw new Error(error.message);
  }
  return toAward;
}

/** Safe backfill for existing learners based on verified progress. */
export async function syncLearnerAchievementsFromHistory(admin: Admin, studentId: string) {
  const metrics = await computeLearnerAchievementMetrics(admin, studentId);
  return grantLearnerAchievements(admin, studentId, metrics);
}

export { evaluateEarnedAchievementCodes };
