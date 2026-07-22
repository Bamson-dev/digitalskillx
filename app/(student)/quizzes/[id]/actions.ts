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
import type { Json } from "@/types/database";

export type QuizResultState = {
  error?: string;
  submitted?: boolean;
  score?: number;
  passed?: boolean | null;
  pendingManual?: boolean;
};

const AUTO_TYPES = ["mcq_single", "mcq_multiple", "true_false"];

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
    .select("id, pass_score, lesson_id, negative_marking, quiz_questions(*, quiz_answers(*))")
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

  const questions = (quiz.quiz_questions ?? []) as {
    id: string;
    question_type: string;
    points: number;
    quiz_answers: { id: string; is_correct: boolean }[];
  }[];

  let earned = 0;
  let autoTotal = 0;
  let pendingManual = false;
  const responses: Record<string, Json> = {};

  for (const q of questions) {
    if (AUTO_TYPES.includes(q.question_type)) {
      autoTotal += q.points;
      const selected = formData.getAll(`q_${q.id}`).map(String);
      responses[q.id] = selected;
      const correctIds = q.quiz_answers.filter((a) => a.is_correct).map((a) => a.id);
      const isCorrect =
        selected.length === correctIds.length &&
        selected.every((id) => correctIds.includes(id));
      if (isCorrect) earned += q.points;
      else if (quiz.negative_marking) earned -= q.points;
    } else {
      pendingManual = true;
      responses[q.id] = String(formData.get(`q_${q.id}`) ?? "");
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

  revalidatePath(`/quizzes/${quizId}`);
  return { submitted: true, score, passed, pendingManual };
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
