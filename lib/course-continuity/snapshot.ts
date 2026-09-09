import type { ContinuityCourseSnapshot } from "@/lib/course-continuity/offline-store";

type LessonLike = {
  id: string;
  title: string;
  position: number;
  content_url?: string | null;
  duration_seconds?: number | null;
  lesson_type?: string | null;
};

type ModuleLike = {
  id: string;
  title: string;
  position: number;
  lessons?: LessonLike[] | null;
};

export function buildContinuitySnapshot(params: {
  courseId: string;
  courseTitle: string;
  modules: ModuleLike[];
}): ContinuityCourseSnapshot {
  return {
    id: params.courseId,
    title: params.courseTitle,
    updatedAt: new Date().toISOString(),
    modules: params.modules
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((mod) => ({
        id: mod.id,
        title: mod.title,
        position: mod.position,
        lessons: (mod.lessons ?? [])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            position: lesson.position,
            videoUrl: lesson.content_url ?? null,
            videoProvider: lesson.lesson_type ?? null,
            durationSeconds: lesson.duration_seconds ?? null,
          })),
      })),
  };
}
