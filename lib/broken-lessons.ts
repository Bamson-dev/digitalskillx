import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getBrokenLessonFlags,
  type BrokenLessonRow,
} from "@/lib/broken-lessons-shared";

export type { BrokenLessonRow } from "@/lib/broken-lessons-shared";
export { getBrokenLessonFlags, isBrokenLesson } from "@/lib/broken-lessons-shared";

type LessonWithModule = {
  id: string;
  title: string;
  youtube_video_id: string | null;
  modules: {
    id: string;
    title: string;
    course_id: string;
    courses: {
      id: string;
      title: string;
    };
  };
};

export async function fetchBrokenLessonsReport(
  supabase: SupabaseClient<Database>,
): Promise<BrokenLessonRow[]> {
  const { data: lessons, error } = await supabase
    .from("lessons")
    .select(
      "id, title, youtube_video_id, modules!inner(id, title, course_id, courses!inner(id, title))",
    )
    .order("position", { ascending: true });

  if (error) {
    console.error("[broken-lessons] query failed:", error.message);
    return [];
  }

  const rows: BrokenLessonRow[] = [];

  for (const lesson of (lessons ?? []) as LessonWithModule[]) {
    const mod = lesson.modules;
    const course = mod.courses;
    const flags = getBrokenLessonFlags(lesson);
    if (flags.length === 0) continue;
    rows.push({
      id: lesson.id,
      title: lesson.title?.trim() || "(no title)",
      courseId: course.id,
      courseTitle: course.title,
      moduleId: mod.id,
      moduleTitle: mod.title,
      youtubeVideoId: lesson.youtube_video_id,
      flags,
    });
  }

  rows.sort((a, b) => {
    const byCourse = a.courseTitle.localeCompare(b.courseTitle);
    if (byCourse !== 0) return byCourse;
    return a.title.localeCompare(b.title);
  });

  return rows;
}
