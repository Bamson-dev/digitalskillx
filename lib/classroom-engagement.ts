/**
 * Classroom engagement moments — learning-first motion.
 * Dance/celebration is reserved for rare, genuine milestones only.
 */

export type CompanionMood =
  | "idle"
  | "encouragement"
  | "correct"
  | "incorrect"
  | "milestone"
  | "challenge"
  | "streak"
  | "completion"
  | "certificate"
  | "celebration";

export type ClassroomMomentKind =
  | "correct"
  | "incorrect"
  | "lesson_complete"
  | "quiz_passed"
  | "quiz_failed"
  | "module_complete"
  | "progress_milestone"
  | "course_complete"
  | "certificate_unlock"
  | "assignment_submitted"
  | "badge_earned"
  | "streak"
  | "challenge_complete";

export type ClassroomMoment = {
  kind: ClassroomMomentKind;
  message: string;
  mood: CompanionMood;
  /** Rare — only major achievements. Never for routine quiz/lesson ticks. */
  allowDance: boolean;
  /** Short particles — only with allowDance or module/course milestones. */
  particles: boolean;
  durationMs: number;
};

const MOMENT_EVENT = "dsx:classroom-moment";

export function momentAllowsDance(kind: ClassroomMomentKind): boolean {
  return kind === "course_complete" || kind === "certificate_unlock";
}

export function buildClassroomMoment(
  kind: ClassroomMomentKind,
  detail?: { pct?: number; score?: number },
): ClassroomMoment {
  const allowDance = momentAllowsDance(kind);

  switch (kind) {
    case "correct":
      return {
        kind,
        message: "Correct.",
        mood: "correct",
        allowDance: false,
        particles: false,
        durationMs: 1600,
      };
    case "incorrect":
      return {
        kind,
        message: "Close. Take another look.",
        mood: "incorrect",
        allowDance: false,
        particles: false,
        durationMs: 2200,
      };
    case "lesson_complete":
      return {
        kind,
        message: "Lesson complete.",
        mood: "encouragement",
        allowDance: false,
        particles: false,
        durationMs: 1800,
      };
    case "quiz_passed":
      return {
        kind,
        message:
          typeof detail?.score === "number"
            ? `Nice work — ${detail.score}%.`
            : "Quiz passed.",
        mood: "correct",
        allowDance: false,
        particles: false,
        durationMs: 2000,
      };
    case "quiz_failed":
      return {
        kind,
        message: "Review this section and try again.",
        mood: "incorrect",
        allowDance: false,
        particles: false,
        durationMs: 2400,
      };
    case "module_complete":
      return {
        kind,
        message: "Module complete. Ready for the next one?",
        mood: "milestone",
        allowDance: false,
        particles: true,
        durationMs: 2400,
      };
    case "progress_milestone": {
      const pct = detail?.pct ?? 0;
      const message =
        pct >= 90
          ? "You're almost there."
          : pct >= 75
            ? "You're getting close."
            : pct >= 50
              ? "You're halfway there."
              : "Solid progress.";
      return {
        kind,
        message,
        mood: "milestone",
        allowDance: false,
        particles: false,
        durationMs: 2000,
      };
    }
    case "course_complete":
      return {
        kind,
        message: "Course complete.",
        mood: "celebration",
        allowDance: true,
        particles: true,
        durationMs: 3200,
      };
    case "certificate_unlock":
      return {
        kind,
        message: "Certificate unlocked.",
        mood: "certificate",
        allowDance: true,
        particles: true,
        durationMs: 3200,
      };
    case "assignment_submitted":
      return {
        kind,
        message: "Submitted. Your instructor will review it.",
        mood: "encouragement",
        allowDance: false,
        particles: false,
        durationMs: 2000,
      };
    case "badge_earned":
      return {
        kind,
        message: "New achievement.",
        mood: "celebration",
        allowDance: false,
        particles: true,
        durationMs: 2400,
      };
    case "streak":
      return {
        kind,
        message: "Keep the learning streak going.",
        mood: "streak",
        allowDance: false,
        particles: false,
        durationMs: 1800,
      };
    case "challenge_complete":
      return {
        kind,
        message: "Challenge complete.",
        mood: "challenge",
        allowDance: false,
        particles: true,
        durationMs: 2400,
      };
    default:
      return {
        kind: "lesson_complete",
        message: "Nice work.",
        mood: "encouragement",
        allowDance: false,
        particles: false,
        durationMs: 1600,
      };
  }
}

/** Meaningful progress thresholds only — never every percent. */
export const PROGRESS_MILESTONE_PCTS = [10, 25, 50, 75, 90, 100] as const;

export function crossedProgressMilestone(prevPct: number, nextPct: number): number | null {
  for (const m of PROGRESS_MILESTONE_PCTS) {
    if (prevPct < m && nextPct >= m) return m;
  }
  return null;
}

export function dispatchClassroomMoment(
  kind: ClassroomMomentKind,
  detail?: { pct?: number; score?: number; dedupeKey?: string },
) {
  if (typeof window === "undefined") return;
  const moment = buildClassroomMoment(kind, detail);
  window.dispatchEvent(
    new CustomEvent(MOMENT_EVENT, {
      detail: { ...moment, dedupeKey: detail?.dedupeKey },
    }),
  );
}

export function classroomMomentEventName() {
  return MOMENT_EVENT;
}

export type CourseEngagementFlags = {
  companionEnabled: boolean;
  celebrationsEnabled: boolean;
};

export function resolveEngagementFlags(input?: {
  companion_enabled?: boolean | null;
  celebrations_enabled?: boolean | null;
}): CourseEngagementFlags {
  return {
    companionEnabled: input?.companion_enabled !== false,
    celebrationsEnabled: input?.celebrations_enabled !== false,
  };
}
