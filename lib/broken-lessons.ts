import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  getBrokenLessonFlags,
  type BrokenLessonRow,
} from "@/lib/broken-lessons-shared";

export type { BrokenLessonRow } from "@/lib/broken-lessons-shared";
export { getBrokenLessonFlags, isBrokenLesson } from "@/lib/broken-lessons-shared";

export async function fetchBrokenLessonsReport(
  supabase: SupabaseClient<Database>,
): Promise<BrokenLessonRow[]> {
  const { data: courses, error: coursesError } = await supabase
    .from("courses")
    .select("id, title")
    .order("title");

  if (coursesError) {
    console.error("[broken-lessons] courses query failed:", coursesError.message);
    return [];
  }
  if (!courses?.length) return [];

  const rows: BrokenLessonRow[] = [];

  for (const course of courses) {
    const { data: modules, error: modulesError } = await supabase
      .from("modules")
      .select("id, title, lessons(id, title, youtube_video_id, position)")
      .eq("course_id", course.id)
      .order("position", { ascending: true });

    if (modulesError) {
      console.error("[broken-lessons] modules query failed:", course.id, modulesError.message);
      continue;
    }

    for (const mod of modules ?? []) {
      const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
      for (const lesson of lessons) {
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
    }
  }

  return rows;
}
