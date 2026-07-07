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
  const { data: courses } = await supabase.from("courses").select("id, title").order("title");
  if (!courses?.length) return [];

  const rows: BrokenLessonRow[] = [];

  for (const course of courses) {
    const { data: modules } = await supabase
      .from("modules")
      .select("id, title, lessons(id, title, youtube_video_id)")
      .eq("course_id", course.id)
      .order("position");

    for (const mod of modules ?? []) {
      for (const lesson of mod.lessons ?? []) {
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
