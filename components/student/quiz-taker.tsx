"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormState } from "react-dom";
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/auth/submit-button";
import { submitQuiz, type QuizResultState } from "@/app/(student)/quizzes/[id]/actions";
import { QuizScoreReveal } from "@/components/student/quiz-score-reveal";
import { dispatchClassroomMoment } from "@/lib/classroom-engagement";
import { cn } from "@/lib/utils";

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
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!timeLimitMins || state.submitted) return;
    const t = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(t);
  }, [timeLimitMins, state.submitted, retryKey]);

  useEffect(() => {
    if (!state.submitted || state.pendingManual) return;
    if (state.passed) {
      dispatchClassroomMoment("quiz_passed", {
        score: state.score,
        dedupeKey: `quiz-pass:${quizId}:${state.score}`,
      });
    } else if (state.passed === false) {
      dispatchClassroomMoment("quiz_failed", {
        score: state.score,
        dedupeKey: `quiz-fail:${quizId}:${retryKey}`,
      });
    }
  }, [state.submitted, state.passed, state.pendingManual, state.score, quizId, retryKey]);

  if (state.submitted) {
    return (
      <div className="space-y-6">
        <div className="border border-neutral-200 bg-white px-5 py-8 text-center sm:px-8">
          {state.pendingManual ? (
            <>
              <Clock className="mx-auto h-9 w-9 text-amber-600" />
              <h2 className="mt-3 font-display text-xl font-bold text-neutral-950">
                Submitted for review
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                Auto-graded score: {state.score}%. Some answers need instructor review — you&apos;ll
                be notified when grading is complete.
              </p>
            </>
          ) : state.passed ? (
            <>
              <CheckCircle2 className="mx-auto h-9 w-9 text-green-600" />
              <h2 className="mt-3 font-display text-xl font-bold text-neutral-950">
                Passed — <QuizScoreReveal score={state.score ?? 0} />
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                You met the {passScore}% pass mark. Review the feedback below, then continue
                learning.
              </p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto h-9 w-9 text-brand" />
              <h2 className="mt-3 font-display text-xl font-bold text-neutral-950">
                Not passed — <QuizScoreReveal score={state.score ?? 0} />
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">
                You need {passScore}% to pass. Review what you missed
                {state.showReview ? " below" : ""}, then try again when you&apos;re ready.
              </p>
            </>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {state.canRetake ? (
              <button
                type="button"
                onClick={() => {
                  setRetryKey((k) => k + 1);
                  window.location.reload();
                }}
                className="inline-flex h-11 items-center gap-2 border border-neutral-200 bg-white px-4 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
              >
                <RotateCcw className="h-4 w-4" />
                Try again
              </button>
            ) : null}
            {state.lessonId ? (
              <Link
                href={`/lessons/${state.lessonId}`}
                className="inline-flex h-11 items-center bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Back to lesson
              </Link>
            ) : null}
          </div>
        </div>

        {state.showReview && state.review && state.review.length > 0 ? (
          <section className="space-y-4">
            <div>
              <h3 className="font-display text-lg font-bold text-neutral-950">Review</h3>
              <p className="mt-1 text-sm text-neutral-500">
                Feedback on this attempt — use it to strengthen what you learned.
              </p>
            </div>
            <ul className="space-y-3">
              {state.review.map((item, idx) => (
                <li key={item.questionId} className="border border-neutral-200 bg-white px-4 py-4">
                  <div className="flex items-start gap-2">
                    {item.manual ? (
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    ) : item.correct ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-neutral-900">
                        {idx + 1}. {item.questionText}
                      </p>
                      {item.manual ? (
                        <p className="mt-2 text-sm text-neutral-600">
                          Waiting for instructor review
                          {item.selectedLabels[0] ? ` · Your answer: ${item.selectedLabels[0]}` : null}
                        </p>
                      ) : item.correct ? (
                        <p className="mt-2 text-sm text-green-800">
                          Correct
                          {item.correctLabels.length
                            ? ` — ${item.correctLabels.join(", ")}`
                            : null}
                        </p>
                      ) : (
                        <div className="mt-2 space-y-1 text-sm">
                          <p className="text-neutral-600">
                            Your answer:{" "}
                            {item.selectedLabels.length
                              ? item.selectedLabels.join(", ")
                              : "No answer"}
                          </p>
                          <p className="font-medium text-neutral-900">
                            Correct answer: {item.correctLabels.join(", ") || "—"}
                          </p>
                          <p className="text-neutral-500">
                            Not quite — review the lesson and try again when you&apos;re ready.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} key={retryKey} className="space-y-5">
      <input type="hidden" name="quiz_id" value={quizId} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Knowledge check
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-neutral-950">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">Pass mark: {passScore}%</p>
        </div>
        {timeLimitMins ? (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold tabular-nums",
              remaining <= 60 ? "bg-brand/10 text-brand" : "bg-neutral-100 text-neutral-700",
            )}
          >
            <Clock className="h-4 w-4" />
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </span>
        ) : null}
      </div>

      {questions.map((q, idx) => (
        <div key={q.id} className="border border-neutral-200 bg-white px-4 py-4 sm:px-5">
          <p className="mb-3 text-sm font-medium text-neutral-900">
            {idx + 1}. {q.question_text}{" "}
            <span className="text-xs font-normal text-neutral-500">({q.points} pt)</span>
          </p>
          <QuestionInput question={q} />
        </div>
      ))}

      {state.error ? (
        <p className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      ) : null}

      <SubmitButton size="lg" pendingText="Submitting…" className="rounded-none">
        Submit quiz
      </SubmitButton>
    </form>
  );
}

function QuestionInput({ question }: { question: Question }) {
  if (question.question_type === "short_answer") {
    return (
      <input
        name={`q_${question.id}`}
        className="h-11 w-full border border-neutral-200 px-3 text-sm"
      />
    );
  }
  if (question.question_type === "essay") {
    return <Textarea name={`q_${question.id}`} rows={5} className="rounded-none" />;
  }
  if (question.question_type === "file_upload") {
    return (
      <input
        name={`q_${question.id}`}
        placeholder="Paste a link to your file (Drive, Loom, etc.)"
        className="h-11 w-full border border-neutral-200 px-3 text-sm"
      />
    );
  }
  const multiple = question.question_type === "mcq_multiple";
  return (
    <div className="space-y-2">
      {question.quiz_answers.map((a) => (
        <label
          key={a.id}
          className="flex min-h-[44px] items-center gap-2 border border-neutral-200 px-3 py-2 text-sm hover:border-neutral-400"
        >
          <input type={multiple ? "checkbox" : "radio"} name={`q_${question.id}`} value={a.id} />
          {a.answer_text}
        </label>
      ))}
    </div>
  );
}
