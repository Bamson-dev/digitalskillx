"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { resolveStudentLessonAccess } from "@/lib/lesson-access";
import { recordLessonProgress } from "@/lib/progress";

async function currentStudent() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();

  return { id: user.id, email: profile?.email ?? user.email ?? null };
}

export async function markLessonComplete(formData: FormData) {
  const student = await currentStudent();
  const lessonId = String(formData.get("lesson_id") ?? "").trim();
  if (!lessonId) throw new Error("Missing lesson");

  const access = await resolveStudentLessonAccess({
    authUserId: student.id,
    lessonId,
    profileEmail: student.email,
  });
  if (!access.ok) throw new Error(access.reason);

  await recordLessonProgress({
    studentId: access.studentId,
    lessonId,
    watchPercentage: 100,
    completed: true,
  });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function updateWatchProgress(lessonId: string, pct: number, requiredPct: number) {
  const student = await currentStudent();
  const access = await resolveStudentLessonAccess({
    authUserId: student.id,
    lessonId,
    profileEmail: student.email,
  });
  if (!access.ok) return;

  const completed = requiredPct > 0 && pct >= requiredPct;
  await recordLessonProgress({
    studentId: access.studentId,
    lessonId,
    watchPercentage: pct,
    completed,
  });
}

export async function saveLessonNote(formData: FormData) {
  const student = await currentStudent();
  const lessonId = String(formData.get("lesson_id"));
  const content = String(formData.get("content") ?? "");
  const access = await resolveStudentLessonAccess({
    authUserId: student.id,
    lessonId,
    profileEmail: student.email,
  });
  if (!access.ok) throw new Error(access.reason);

  const supabase = createClient();
  await supabase
    .from("student_notes")
    .upsert(
      { student_id: access.studentId, lesson_id: lessonId, content },
      { onConflict: "student_id,lesson_id" },
    );
  revalidatePath(`/lessons/${lessonId}`);
}

export async function addBookmark(formData: FormData) {
  const student = await currentStudent();
  const lessonId = String(formData.get("lesson_id"));
  const seconds = Number(formData.get("timestamp_seconds") ?? 0);
  const label = String(formData.get("label") ?? "") || null;
  const access = await resolveStudentLessonAccess({
    authUserId: student.id,
    lessonId,
    profileEmail: student.email,
  });
  if (!access.ok) throw new Error(access.reason);

  const supabase = createClient();
  await supabase.from("bookmarks").insert({
    student_id: access.studentId,
    lesson_id: lessonId,
    timestamp_seconds: Number.isFinite(seconds) ? Math.round(seconds) : 0,
    label,
  });
  revalidatePath(`/lessons/${lessonId}`);
}

export async function deleteBookmark(formData: FormData) {
  const student = await currentStudent();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  const access = await resolveStudentLessonAccess({
    authUserId: student.id,
    lessonId,
    profileEmail: student.email,
  });
  if (!access.ok) throw new Error(access.reason);
  await supabase
    .from("bookmarks")
    .delete()
    .eq("id", id)
    .eq("student_id", access.studentId);
  revalidatePath(`/lessons/${lessonId}`);
}
