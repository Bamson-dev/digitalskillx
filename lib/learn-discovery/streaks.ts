import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { isMissingRelationError } from "@/lib/schema-guard";
import {
  applyStreakActivityDay,
  learnStreakDayKey,
  refreshCurrentStreak,
  type StreakState,
} from "@/lib/learn-discovery/streaks-shared";

type Admin = SupabaseClient<Database>;

const DEFAULT_STREAK: StreakState = {
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDay: null,
};

export async function loadLearnerStreak(admin: Admin, studentId: string): Promise<StreakState> {
  const { data, error } = await admin
    .from("learn_learner_streaks")
    .select("current_streak, longest_streak, last_active_day")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) {
    if (isMissingRelationError(error.message)) return { ...DEFAULT_STREAK };
    throw new Error(error.message);
  }
  if (!data) return { ...DEFAULT_STREAK };
  const state: StreakState = {
    currentStreak: data.current_streak ?? 0,
    longestStreak: data.longest_streak ?? 0,
    lastActiveDay: data.last_active_day ?? null,
  };
  return refreshCurrentStreak(state, learnStreakDayKey(new Date()));
}

/**
 * Record lesson-completion activity for streak (server-only, idempotent per day).
 * Event: authenticated learner completes at least one Learn lesson.
 */
export async function recordLearnStreakActivity(
  admin: Admin,
  studentId: string,
  completedAtIso = new Date().toISOString(),
): Promise<StreakState> {
  const dayKey = learnStreakDayKey(completedAtIso);
  const existing = await loadLearnerStreak(admin, studentId);
  const next = applyStreakActivityDay(existing, dayKey);
  const refreshed = refreshCurrentStreak(next, learnStreakDayKey(new Date()));

  const { error } = await admin.from("learn_learner_streaks").upsert(
    {
      student_id: studentId,
      current_streak: refreshed.currentStreak,
      longest_streak: refreshed.longestStreak,
      last_active_day: refreshed.lastActiveDay,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "student_id" },
  );
  if (error && !isMissingRelationError(error.message)) {
    throw new Error(error.message);
  }
  return refreshed;
}

/** Backfill streak from historical progress (safe, idempotent). */
export async function syncLearnerStreakFromHistory(admin: Admin, studentId: string): Promise<StreakState> {
  const { data, error } = await admin
    .from("learning_path_progress")
    .select("completed_at")
    .eq("student_id", studentId)
    .order("completed_at", { ascending: true });
  if (error) {
    if (isMissingRelationError(error.message)) return { ...DEFAULT_STREAK };
    throw new Error(error.message);
  }

  let state: StreakState = { ...DEFAULT_STREAK };
  const seenDays = new Set<string>();
  for (const row of data ?? []) {
    const day = learnStreakDayKey(row.completed_at);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    state = applyStreakActivityDay(state, day);
  }
  state = refreshCurrentStreak(state, learnStreakDayKey(new Date()));

  const { error: upsertError } = await admin.from("learn_learner_streaks").upsert(
    {
      student_id: studentId,
      current_streak: state.currentStreak,
      longest_streak: state.longestStreak,
      last_active_day: state.lastActiveDay,
      updated_at: new Date().toISOString(),
    } as never,
    { onConflict: "student_id" },
  );
  if (upsertError && !isMissingRelationError(upsertError.message)) {
    throw new Error(upsertError.message);
  }
  return state;
}
