import { toPercent } from "@/lib/utils";

export function encouragementMessage(pct: number) {
  if (pct >= 100) return "Congratulations! You've completed this course.";
  if (pct >= 75) return "Almost there! Finish strong to earn your certificate.";
  if (pct >= 50) return "You are halfway. Keep going to earn your certificate.";
  if (pct >= 25) return "You're making progress. Keep going!";
  return "Great start! Keep going to earn your certificate.";
}

export function CourseProgressNudge({
  pct,
  lessonsLeft,
  totalLessons,
  compact = false,
}: {
  pct: number;
  lessonsLeft: number;
  totalLessons: number;
  compact?: boolean;
}) {
  const message = encouragementMessage(pct);
  const lessonsLabel =
    lessonsLeft === 0
      ? "All lessons complete"
      : lessonsLeft === 1
        ? "1 lesson left"
        : `${lessonsLeft} lessons left`;

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500">
        <span>{pct}% complete</span>
        {totalLessons > 0 ? <span>{lessonsLabel}</span> : null}
      </div>
      <div className={`overflow-hidden rounded-full bg-neutral-100 ${compact ? "h-2" : "h-2.5"}`}>
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${toPercent(pct)}%` }}
        />
      </div>
      <p className={`text-neutral-600 ${compact ? "text-xs" : "text-sm"}`}>{message}</p>
    </div>
  );
}
