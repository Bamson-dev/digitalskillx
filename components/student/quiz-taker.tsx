"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/auth/submit-button";
import { submitQuiz, type QuizResultState } from "@/app/(student)/quizzes/[id]/actions";

type Answer = { id: string; answer_text: string };
type Question = {
  id: string;
  question_text: string;
  question_type: string;
  points: number;
  quiz_answers: Answer[];
};

const initial: QuizResultState = {};

export function QuizTaker({
  quizId,
  title,
  passScore,
  timeLimitMins,
  questions,
}: {
  quizId: string;
  title: string;
  passScore: number;
  timeLimitMins: number | null;
  questions: Question[];
}) {
  const [state, action] = useFormState(submitQuiz, initial);
  const [remaining, setRemaining] = useState((timeLimitMins ?? 0) * 60);

  useEffect(() => {
    if (!timeLimitMins || state.submitted) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLimitMins, state.submitted]);

  if (state.submitted) {
    return (
      <Card className="text-center">
        {state.pendingManual ? (
          <>
            <Clock className="mx-auto h-10 w-10 text-amber-500" />
            <h2 className="mt-3 text-lg font-bold">Submitted for review</h2>
            <p className="mt-1 text-sm text-muted">
              Auto-graded score: {state.score}%. Some questions need manual grading — you&apos;ll be
              notified when complete.
            </p>
          </>
        ) : state.passed ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h2 className="mt-3 text-lg font-bold">Passed — {state.score}%</h2>
            <p className="mt-1 text-sm text-muted">Great work! You met the {passScore}% pass mark.</p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-10 w-10 text-red-600" />
            <h2 className="mt-3 text-lg font-bold">Not passed — {state.score}%</h2>
            <p className="mt-1 text-sm text-muted">You need {passScore}% to pass. Review the lesson and try again.</p>
          </>
        )}
      </Card>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="quiz_id" value={quizId} />

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{title}</h1>
        {timeLimitMins ? (
          <span className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
            <Clock className="h-4 w-4" />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        ) : null}
      </div>

      {questions.map((q, idx) => (
        <Card key={q.id}>
          <p className="mb-3 font-medium">
            {idx + 1}. {q.question_text}{" "}
            <span className="text-xs text-muted">({q.points} pt)</span>
          </p>
          <QuestionInput question={q} />
        </Card>
      ))}

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <SubmitButton size="lg" pendingText="Submitting…">
        Submit quiz
      </SubmitButton>
    </form>
  );
}

function QuestionInput({ question }: { question: Question }) {
  if (question.question_type === "short_answer") {
    return <input name={`q_${question.id}`} className="h-10 w-full rounded-lg border border-app px-3 text-sm" />;
  }
  if (question.question_type === "essay") {
    return <Textarea name={`q_${question.id}`} rows={5} />;
  }
  if (question.question_type === "file_upload") {
    return (
      <input
        name={`q_${question.id}`}
        placeholder="Paste a link to your file (Drive, Loom, etc.)"
        className="h-10 w-full rounded-lg border border-app px-3 text-sm"
      />
    );
  }
  const multiple = question.question_type === "mcq_multiple";
  return (
    <div className="space-y-2">
      {question.quiz_answers.map((a) => (
        <label key={a.id} className="flex items-center gap-2 rounded-lg border border-app px-3 py-2 text-sm hover:bg-brand-50/40">
          <input type={multiple ? "checkbox" : "radio"} name={`q_${question.id}`} value={a.id} />
          {a.answer_text}
        </label>
      ))}
    </div>
  );
}
