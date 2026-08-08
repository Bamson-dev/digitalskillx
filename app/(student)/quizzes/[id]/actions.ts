"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { evaluateAndCompleteCourse } from "@/lib/course-completion";
import { courseCompletionPct } from "@/lib/progress";
import { resolveStudentLessonAccess } from "@/lib/lesson-access";
import { sendProgressMilestoneEmailsIfNeeded } from "@/lib/system-email-triggers";
import { runAutomations } from "@/lib/automation";
import { notify } from "@/lib/notifications";
import type { Json, ShowAnswersMode } from "@/types/database";

export type QuizReviewItem = {
  questionId: string;
  questionText: string;
  correct: boolean | null;
  selectedLabels: string[];
  correctLabels: string[];
  manual: boolean;
};

export type QuizResultState = {
  error?: string;
  submitted?: boolean;
  score?: number;
  passed?: boolean | null;
  pendingManual?: boolean;
  showReview?: boolean;
  review?: QuizReviewItem[];
  lessonId?: string | null;
  canRetake?: boolean;
};

const AUTO_TYPES = ["mcq_single", "mcq_multiple", "true_false"];

function shouldShowAnswers(mode: ShowAnswersMode | null | undefined, passed: boolean | null): boolean {
  if (mode === "never") return false;
  if (mode === "always") return true;
  // on_pass (default)
  return passed === true;
}

export async function submitQuiz(
  _prev: QuizResultState,
  formData: FormData,
): Promise<QuizResultState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const quizId = String(formData.get("quiz_id"));

  // Use admin client to read correct answers securely server-side.
  const admin = createAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select(
      "id, pass_score, lesson_id, negative_marking, show_answers_on, retake_rule, retake_limit, quiz_questions(*, quiz_answers(*))",
    )
    .eq("id", quizId)
    .single();
  if (!quiz) return { error: "Quiz not found" };
  if (!quiz.lesson_id) return { error: "This quiz is not linked to a lesson." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", user.id)
    .maybeSingle();
  const access = await resolveStudentLessonAccess({
    authUserId: user.id,
    lessonId: quiz.lesson_id,
    profileEmail: profile?.email ?? user.email,
  });
  if (!access.ok) return { error: access.reason };
  const studentId = access.studentId;
  const courseId = access.courseId;

  const { count: priorAttempts } = await admin
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("quiz_id", quizId);
  const attemptCount = (priorAttempts ?? 0) + 1; // including this submission

  const questions = (quiz.quiz_questions ?? []) as {
    id: string;
    question_text: string;
    question_type: string;
    points: number;
    quiz_answers: { id: string; answer_text: string; is_correct: boolean }[];
  }[];

  let earned = 0;
  let autoTotal = 0;
  let pendingManual = false;
  const responses: Record<string, Json> = {};
  const review: QuizReviewItem[] = [];

  for (const q of questions) {
    if (AUTO_TYPES.includes(q.question_type)) {
      autoTotal += q.points;
      const selected = formData.getAll(`q_${q.id}`).map(String);
      responses[q.id] = selected;
      const correctAnswers = q.quiz_answers.filter((a) => a.is_correct);
      const correctIds = correctAnswers.map((a) => a.id);
      const isCorrect =
        selected.length === correctIds.length &&
        selected.every((id) => correctIds.includes(id));
      if (isCorrect) earned += q.points;
      else if (quiz.negative_marking) earned -= q.points;

      const selectedLabels = q.quiz_answers
        .filter((a) => selected.includes(a.id))
        .map((a) => a.answer_text);
      review.push({
        questionId: q.id,
        questionText: q.question_text,
        correct: isCorrect,
        selectedLabels,
        correctLabels: correctAnswers.map((a) => a.answer_text),
        manual: false,
      });
    } else {
      pendingManual = true;
      const raw = String(formData.get(`q_${q.id}`) ?? "");
      responses[q.id] = raw;
      review.push({
        questionId: q.id,
        questionText: q.question_text,
        correct: null,
        selectedLabels: raw ? [raw] : [],
        correctLabels: [],
        manual: true,
      });
    }
  }

  const score = autoTotal > 0 ? Math.max(0, Math.round((earned / autoTotal) * 100)) : 0;
  const passed = pendingManual ? null : score >= quiz.pass_score;

  await admin.from("quiz_attempts").insert({
    student_id: studentId,
    quiz_id: quizId,
    score,
    passed,
    responses,
    submitted_at: new Date().toISOString(),
  });

  if (passed === true) {
    await runAutomations("quiz_passed", { studentId, courseId, quizId });
    if (courseId) {
      const completion = await evaluateAndCompleteCourse(studentId, courseId);
      const pct = completion.coursePct ?? (await courseCompletionPct(studentId, courseId));
      void sendProgressMilestoneEmailsIfNeeded({
        studentId,
        courseId,
        pct,
      }).catch((err) => console.error("[quiz] milestone email error:", err));
    }
  } else if (passed === false) {
    await runAutomations("quiz_failed", { studentId, courseId, quizId });
  }

  const showReview = shouldShowAnswers(quiz.show_answers_on as ShowAnswersMode, passed);

  revalidatePath(`/quizzes/${quizId}`);
  if (quiz.lesson_id) revalidatePath(`/lessons/${quiz.lesson_id}`);

  return {
    submitted: true,
    score,
    passed,
    pendingManual,
    showReview,
    review: showReview ? review : undefined,
    lessonId: quiz.lesson_id,
    canRetake: quiz.retake_rule === "unlimited" ||
      (quiz.retake_rule === "limited" &&
        quiz.retake_limit != null &&
        attemptCount < quiz.retake_limit),
  };
}

/** Admin manual grading of an attempt (PRD §9.3). */
export async function gradeAttempt(formData: FormData) {
  await requireAdmin();
  const admin = createAdminClient();
  const attemptId = String(formData.get("attempt_id"));
  const score = Number(formData.get("score") ?? 0);
  const passScore = Number(formData.get("pass_score") ?? 70);
  const passed = score >= passScore;

  const { data: attempt } = await admin
    .from("quiz_attempts")
    .update({ score, passed })
    .eq("id", attemptId)
    .select("student_id")
    .single();

  if (attempt) {
    await notify({
      studentId: attempt.student_id,
      type: "quiz_graded",
      title: "Quiz graded",
      message: `Your quiz was graded: ${score}% (${passed ? "passed" : "not passed"}).`,
    });
    await logAudit({
      action: "quiz_attempt_graded",
      targetType: "quiz_attempt",
      targetId: attemptId,
      metadata: { score, passed },
    });
  }
  revalidatePath("/admin/grading");
}
