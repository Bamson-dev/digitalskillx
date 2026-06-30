"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth";
import type { QuestionType, ShowAnswersMode, RetakeRule } from "@/types/database";

export async function createQuizForLesson(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const lessonId = String(formData.get("lesson_id"));
  await supabase.from("quizzes").insert({
    scope: "lesson",
    lesson_id: lessonId,
    title: String(formData.get("title") ?? "Quiz"),
  });
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function updateQuizSettings(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  const timeLimit = formData.get("time_limit_mins") ? Number(formData.get("time_limit_mins")) : null;
  const retakeLimit = formData.get("retake_limit") ? Number(formData.get("retake_limit")) : null;

  await supabase
    .from("quizzes")
    .update({
      title: String(formData.get("title") ?? "Quiz"),
      pass_score: Number(formData.get("pass_score") ?? 70),
      time_limit_mins: timeLimit,
      retake_rule: String(formData.get("retake_rule") ?? "unlimited") as RetakeRule,
      retake_limit: retakeLimit,
      randomize_questions: formData.get("randomize_questions") === "on",
      randomize_answers: formData.get("randomize_answers") === "on",
      negative_marking: formData.get("negative_marking") === "on",
      show_answers_on: String(formData.get("show_answers_on") ?? "on_pass") as ShowAnswersMode,
    })
    .eq("id", id);
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function deleteQuiz(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  await supabase.from("quizzes").delete().eq("id", id);
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function addQuestion(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const quizId = String(formData.get("quiz_id"));
  const lessonId = String(formData.get("lesson_id"));
  const type = String(formData.get("question_type") ?? "mcq_single") as QuestionType;

  const { count } = await supabase
    .from("quiz_questions")
    .select("*", { count: "exact", head: true })
    .eq("quiz_id", quizId);

  const { data: question } = await supabase
    .from("quiz_questions")
    .insert({
      quiz_id: quizId,
      question_text: String(formData.get("question_text") ?? "Untitled question"),
      question_type: type,
      points: Number(formData.get("points") ?? 1),
      position: count ?? 0,
    })
    .select("id")
    .single();

  // Seed default choices for choice-based questions.
  if (question && (type === "true_false")) {
    await supabase.from("quiz_answers").insert([
      { question_id: question.id, answer_text: "True", is_correct: true, position: 0 },
      { question_id: question.id, answer_text: "False", is_correct: false, position: 1 },
    ]);
  }
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function deleteQuestion(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  await supabase.from("quiz_questions").delete().eq("id", id);
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function addAnswer(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const questionId = String(formData.get("question_id"));
  const lessonId = String(formData.get("lesson_id"));
  const { count } = await supabase
    .from("quiz_answers")
    .select("*", { count: "exact", head: true })
    .eq("question_id", questionId);
  await supabase.from("quiz_answers").insert({
    question_id: questionId,
    answer_text: String(formData.get("answer_text") ?? "Option"),
    is_correct: formData.get("is_correct") === "on",
    position: count ?? 0,
  });
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function toggleAnswerCorrect(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  const isCorrect = formData.get("is_correct") === "true";
  await supabase.from("quiz_answers").update({ is_correct: isCorrect }).eq("id", id);
  revalidatePath(`/admin/quizzes/${lessonId}`);
}

export async function deleteAnswer(formData: FormData) {
  await requireAdmin();
  const supabase = createClient();
  const id = String(formData.get("id"));
  const lessonId = String(formData.get("lesson_id"));
  await supabase.from("quiz_answers").delete().eq("id", id);
  revalidatePath(`/admin/quizzes/${lessonId}`);
}
