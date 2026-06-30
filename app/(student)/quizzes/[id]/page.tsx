import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuizTaker } from "@/components/student/quiz-taker";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Quiz" };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default async function StudentQuizPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const supabase = createClient();

  // IMPORTANT: do NOT select quiz_answers.is_correct — keep answers hidden.
  const { data: quiz } = await supabase
    .from("quizzes")
    .select(
      "id, title, pass_score, time_limit_mins, retake_rule, retake_limit, randomize_questions, randomize_answers, quiz_questions(id, question_text, question_type, points, position, quiz_answers(id, answer_text, position))",
    )
    .eq("id", params.id)
    .single();
  if (!quiz) notFound();

  const { data: attempts } = await supabase
    .from("quiz_attempts")
    .select("id, score, passed, submitted_at")
    .eq("student_id", profile.id)
    .eq("quiz_id", params.id)
    .order("submitted_at", { ascending: false });

  const attemptCount = attempts?.length ?? 0;
  const blocked =
    (quiz.retake_rule === "none" && attemptCount >= 1) ||
    (quiz.retake_rule === "limited" && quiz.retake_limit != null && attemptCount >= quiz.retake_limit);

  let questions = [...(quiz.quiz_questions ?? [])].sort((a, b) => a.position - b.position);
  if (quiz.randomize_questions) questions = shuffle(questions);
  questions = questions.map((q) => ({
    ...q,
    quiz_answers: quiz.randomize_answers
      ? shuffle(q.quiz_answers ?? [])
      : [...(q.quiz_answers ?? [])].sort((a, b) => a.position - b.position),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {attemptCount > 0 ? (
        <Card>
          <CardHeader title="Attempt history" />
          <ul className="space-y-1 text-sm">
            {attempts!.map((a) => (
              <li key={a.id} className="flex items-center justify-between">
                <span className="text-muted">{formatDate(a.submitted_at, { dateStyle: "medium", timeStyle: "short" })}</span>
                <span className="flex items-center gap-2">
                  {a.score ?? "—"}%
                  {a.passed == null ? (
                    <Badge tone="amber">Pending</Badge>
                  ) : a.passed ? (
                    <Badge tone="green">Passed</Badge>
                  ) : (
                    <Badge tone="red">Failed</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {blocked ? (
        <Card className="text-center text-sm text-muted">
          You&apos;ve used all available attempts for this quiz.
        </Card>
      ) : (
        <QuizTaker
          quizId={quiz.id}
          title={quiz.title}
          passScore={quiz.pass_score}
          timeLimitMins={quiz.time_limit_mins}
          questions={questions}
        />
      )}
    </div>
  );
}
