/**
 * Learn Library achievements — pure definitions and evaluation.
 * Awards must be granted server-side only; never trust the client.
 */

export const LEARN_ACHIEVEMENT_DEFINITIONS = [
  {
    code: "first_lesson",
    title: "First Lesson Completed",
    description: "You completed your first free Learn lesson.",
    sortOrder: 10,
  },
  {
    code: "first_course_started",
    title: "First Course Started",
    description: "You started your first free learning path.",
    sortOrder: 20,
  },
  {
    code: "first_course_completed",
    title: "First Course Completed",
    description: "You finished your first free learning path.",
    sortOrder: 30,
  },
  {
    code: "courses_completed_3",
    title: "3 Courses Completed",
    description: "You completed 3 free learning paths.",
    sortOrder: 40,
  },
  {
    code: "courses_completed_5",
    title: "5 Courses Completed",
    description: "You completed 5 free learning paths.",
    sortOrder: 50,
  },
  {
    code: "courses_completed_10",
    title: "10 Courses Completed",
    description: "You completed 10 free learning paths.",
    sortOrder: 60,
  },
  {
    code: "courses_completed_25",
    title: "25 Courses Completed",
    description: "You completed 25 free learning paths.",
    sortOrder: 70,
  },
  {
    code: "courses_completed_50",
    title: "50 Courses Completed",
    description: "You completed 50 free learning paths.",
    sortOrder: 80,
  },
] as const;

export type LearnAchievementCode = (typeof LEARN_ACHIEVEMENT_DEFINITIONS)[number]["code"];

export type LearnerAchievementMetrics = {
  lessonsCompleted: number;
  coursesStarted: number;
  coursesCompleted: number;
};

export function evaluateEarnedAchievementCodes(
  metrics: LearnerAchievementMetrics,
): LearnAchievementCode[] {
  const earned: LearnAchievementCode[] = [];
  if (metrics.lessonsCompleted >= 1) earned.push("first_lesson");
  if (metrics.coursesStarted >= 1) earned.push("first_course_started");
  if (metrics.coursesCompleted >= 1) earned.push("first_course_completed");
  if (metrics.coursesCompleted >= 3) earned.push("courses_completed_3");
  if (metrics.coursesCompleted >= 5) earned.push("courses_completed_5");
  if (metrics.coursesCompleted >= 10) earned.push("courses_completed_10");
  if (metrics.coursesCompleted >= 25) earned.push("courses_completed_25");
  if (metrics.coursesCompleted >= 50) earned.push("courses_completed_50");
  return earned;
}

/** Codes to newly award (idempotent set difference). */
export function newlyEarnedAchievementCodes(
  metrics: LearnerAchievementMetrics,
  alreadyEarned: Iterable<string>,
): LearnAchievementCode[] {
  const have = new Set(alreadyEarned);
  return evaluateEarnedAchievementCodes(metrics).filter((code) => !have.has(code));
}

export function achievementDefinition(code: string) {
  return LEARN_ACHIEVEMENT_DEFINITIONS.find((row) => row.code === code) ?? null;
}
