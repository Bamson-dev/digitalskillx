export type NextBestActionKind =
  | "mark_complete"
  | "take_quiz"
  | "next_lesson"
  | "view_certificate"
  | "back_to_course"
  | "dashboard";

export type ResolvedNextBestAction = {
  kind: NextBestActionKind;
  href: string;
  label: string;
  detail?: string;
};

/** Pick a single primary next action for the classroom. */
export function resolveNextBestAction(input: {
  lessonCompleted: boolean;
  quizId?: string | null;
  quizPassed?: boolean | null;
  nextLessonId?: string | null;
  courseId: string;
  certificateId?: string | null;
  courseComplete?: boolean;
}): ResolvedNextBestAction | null {
  if (!input.lessonCompleted) return null; // Mark complete stays in player sticky bar

  if (input.quizId && input.quizPassed !== true) {
    return {
      kind: "take_quiz",
      href: `/quizzes/${input.quizId}`,
      label: "Take the quiz",
      detail: "Check what you learned before moving on.",
    };
  }

  if (input.nextLessonId) {
    return {
      kind: "next_lesson",
      href: `/lessons/${input.nextLessonId}`,
      label: "Continue to next lesson",
      detail: "Keep your momentum — the next lesson is ready.",
    };
  }

  if (input.courseComplete && input.certificateId) {
    return {
      kind: "view_certificate",
      href: `/certificates/${input.certificateId}`,
      label: "View your certificate",
      detail: "You finished this course.",
    };
  }

  if (input.courseComplete) {
    return {
      kind: "dashboard",
      href: "/dashboard",
      label: "Back to dashboard",
      detail: "Course complete. Choose what to learn next.",
    };
  }

  return {
    kind: "back_to_course",
    href: `/courses/${input.courseId}`,
    label: "Back to course map",
    detail: "Review remaining lessons and resources.",
  };
}
