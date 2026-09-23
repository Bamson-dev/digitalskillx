/**
 * Learn Library streak math (pure).
 *
 * Streak event: completing at least one Learn lesson (learning_path_progress insert)
 * on a calendar day in Africa/Lagos (WAT, UTC+1, no DST) — DigitalSkillX primary market.
 * Multiple lesson completions on the same local calendar day count once.
 */

export const LEARN_STREAK_TIMEZONE = "Africa/Lagos";

/** Format an Instant as YYYY-MM-DD in LEARN_STREAK_TIMEZONE. */
export function learnStreakDayKey(isoOrDate: string | Date, nowOffsetMs = 0): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const shifted = new Date(d.getTime() + nowOffsetMs);
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LEARN_STREAK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(shifted);
}

export function addCalendarDays(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + delta);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

export type StreakState = {
  currentStreak: number;
  longestStreak: number;
  lastActiveDay: string | null;
};

/**
 * Apply one activity day. Idempotent for the same dayKey.
 * If the last active day was yesterday → extend. Same day → no-op.
 * Gap > 1 day → reset current to 1 (longest preserved).
 */
export function applyStreakActivityDay(state: StreakState, dayKey: string): StreakState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
    return { ...state };
  }
  if (state.lastActiveDay === dayKey) {
    return {
      currentStreak: state.currentStreak,
      longestStreak: Math.max(state.longestStreak, state.currentStreak),
      lastActiveDay: state.lastActiveDay,
    };
  }

  let current = 1;
  if (state.lastActiveDay) {
    const yesterday = addCalendarDays(dayKey, -1);
    if (state.lastActiveDay === yesterday) {
      current = Math.max(1, state.currentStreak) + 1;
    }
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(state.longestStreak, current),
    lastActiveDay: dayKey,
  };
}

/** Recompute current streak relative to "today" (may drop if gap). */
export function refreshCurrentStreak(state: StreakState, todayKey: string): StreakState {
  if (!state.lastActiveDay) {
    return { currentStreak: 0, longestStreak: state.longestStreak, lastActiveDay: null };
  }
  if (state.lastActiveDay === todayKey || state.lastActiveDay === addCalendarDays(todayKey, -1)) {
    return state;
  }
  return {
    currentStreak: 0,
    longestStreak: state.longestStreak,
    lastActiveDay: state.lastActiveDay,
  };
}
