import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatComingSoonAvailableAt } from "@/lib/lesson-coming-soon";

type LessonComingSoonViewProps = {
  lessonTitle: string;
  courseTitle: string;
  courseId: string;
  description?: string | null;
  availableAt?: string | null;
};

export function LessonComingSoonView({
  lessonTitle,
  courseTitle,
  courseId,
  description,
  availableAt,
}: LessonComingSoonViewProps) {
  const formattedDate = formatComingSoonAvailableAt(availableAt);

  return (
    <div className="border border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-5 py-6 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
          Coming soon
          {formattedDate ? ` · Expected ${formattedDate}` : null}
        </p>
        <h1 className="mt-3 font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
          {lessonTitle}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">{courseTitle}</p>
      </div>

      <div className="px-5 py-8 sm:px-6">
        <p className="max-w-md text-sm leading-relaxed text-neutral-600">
          {formattedDate
            ? `This lesson isn’t published yet. Access opens here when it’s ready${formattedDate ? ` (expected ${formattedDate})` : ""}.`
            : "This lesson isn’t published yet. It will appear here automatically when it’s ready."}
        </p>
        {description ? (
          <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-500">{description}</p>
        ) : null}
        <Link
          href={`/courses/${courseId}`}
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course
        </Link>
      </div>
    </div>
  );
}
