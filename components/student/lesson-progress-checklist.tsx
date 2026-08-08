import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

/** Honest, low-noise checklist for what still blocks meaningful lesson progress. */
export function LessonProgressChecklist({
  lessonCompleted,
  quiz,
}: {
  lessonCompleted: boolean;
  quiz?: { id: string; title: string; passed: boolean } | null;
}) {
  if (!quiz) return null;

  return (
    <section className="border-y border-neutral-200 px-4 py-4 sm:border sm:px-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Lesson checklist
      </p>
      <ul className="mt-3 space-y-2.5">
        <li className="flex items-start gap-2.5 text-sm text-neutral-800">
          {lessonCompleted ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          )}
          <span>
            {lessonCompleted ? "Lesson completed" : "Mark this lesson complete when you\u2019re ready"}
          </span>
        </li>
        <li className="flex items-start gap-2.5 text-sm text-neutral-800">
          {quiz.passed ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <Circle className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
          )}
          <span className="min-w-0">
            {quiz.passed ? (
              <>Quiz passed — {quiz.title}</>
            ) : (
              <>
                Quiz pending —{" "}
                <Link href={`/quizzes/${quiz.id}`} className="font-semibold text-brand hover:underline">
                  {quiz.title}
                </Link>
              </>
            )}
          </span>
        </li>
      </ul>
    </section>
  );
}
