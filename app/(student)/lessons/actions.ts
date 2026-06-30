"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordLessonProgress } from "@/lib/progress";

/** Resolve the authenticated student id, or throw. */
async function currentStudentId() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

/** Verify the student can access this lesson (enrolled or free preview). */
async function assertLessonAccess(lessonId: string) {
  const supabase = createClient();
  // RLS already restricts visibility; a successful read implies access.
  const { data, error } = await supabase.from("lessons").select("id").eq("id", lessonId).single();
  if (error || !data) throw new Error("No access to this lesson");
}

export async function markLessonComplete(formData: FormData) {
  const studentId = await currentStudentId();
  const lessonId = String(formData.get("lesson_id"));
  await assertLessonAccess(lessonId);
  await recordLessonProgress({ studentId, lessonId, watchPercentage: 100, completed: true });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function updateWatchProgress(lessonId: string, pct: number, requiredPct: number) {
  const studentId = await currentStudentId();
  await assertLessonAccess(lessonId);
  const completed = requiredPct > 0 && pct >= requiredPct;
  await recordLessonProgress({ studentId, lessonId, watchPercentage: pct, completed });
}

export async function saveLessonNote(formData: FormData) {
  const studentId = await currentStudentId();
  const supabase = createClient();
  const lessonId = String(formData.get("lesson_id"));
  const content = String(formData.get("content") ?? "");
  await supabase
    .from("student_notes")
    .upsert({ student_id: studentId, lesson_id: lessonId, content }, { onConflict: "student_id,lesson_id" });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function addBookmark(formData: FormData) {
  const studentId = await currentStudentId();
  const supabase = createClient();
  const lessonId = String(formData.get("lesson_id"));
  const seconds = Number(formData.get("timestamp_seconds") ?? 0);
  const label = String(formData.get("label") ?? "") || null;
  await supabase.from("bookmarks").insert({
    student_id: studentId,
    lesson_id: lessonId,
    timestamp_seconds: Number.isFinite(seconds) ? Math.round(seconds) : 0,
    label,
  });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function deleteBookmark(formData: FormData) {
  const studentId = await currentStudentId();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  await supabase.from("bookmarks").delete().eq("id", id).eq("student_id", studentId);
  revalidatePath(`/lessons/${lessonId}`);
}
