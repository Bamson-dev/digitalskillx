import Link from "next/link";
import { ArrowLeft, CalendarClock, Clock } from "lucide-react";
import { formatComingSoonAvailableAt } from "@/lib/lesson-coming-soon";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
    <Card className="overflow-hidden">
      <div className="border-b border-surface-border bg-gradient-to-br from-amber-50 via-white to-brand-50/30 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="amber">Coming soon</Badge>
          {formattedDate ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-900">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              Expected {formattedDate}
            </span>
          ) : null}
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-neutral-950 sm:text-3xl">{lessonTitle}</h1>
        <p className="mt-1 text-sm text-muted">{courseTitle}</p>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-12 text-center sm:py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <Clock className="h-7 w-7" aria-hidden />
        </div>
        <div className="max-w-md space-y-2">
          <h2 className="text-lg font-semibold text-neutral-900">This lesson is being prepared</h2>
          <p className="text-sm leading-relaxed text-muted">
            {formattedDate
              ? `We're finishing this lesson and plan to publish it by ${formattedDate}. You'll get full access here as soon as it's live.`
              : "We're still recording and editing this lesson. Check back soon — it will appear here automatically when it's ready."}
          </p>
          {description ? (
            <p className="pt-2 text-sm leading-relaxed text-neutral-600">{description}</p>
          ) : null}
        </div>
        <Link
          href={`/courses/${courseId}`}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to course overview
        </Link>
      </div>
    </Card>
  );
}
