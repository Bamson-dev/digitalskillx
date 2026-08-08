import Link from "next/link";
import { CheckCircle2, Circle, Clock, Lock, PlayCircle } from "lucide-react";
import {
  displayStudentLessonTitle,
  displayStudentModuleTitle,
  formatLessonDuration,
  normalizeOutlineModules,
  type ModuleWithLessons,
} from "@/lib/lesson-display";
import { isLessonComingSoon } from "@/lib/lesson-coming-soon";
import { cn, toPercent } from "@/lib/utils";

export function CourseCurriculumList({
  modules,
  completedIds,
  lockedIds,
  progressPct,
  resumeLessonId,
}: {
  modules: ModuleWithLessons[];
  completedIds?: Set<string> | string[];
  lockedIds?: Set<string> | string[];
  progressPct?: number;
  resumeLessonId?: string | null;
}) {
  const displayModules = normalizeOutlineModules(modules);
  const completed =
    completedIds instanceof Set
      ? completedIds
      : new Set(completedIds ?? []);
  const locked =
    lockedIds instanceof Set ? lockedIds : new Set(lockedIds ?? []);
  const totalLessons = displayModules.reduce(
    (n, m) => n + (m.lessons?.length ?? 0),
    0,
  );
  const doneCount = completed.size;

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-neutral-950">Course map</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {totalLessons > 0
              ? `${doneCount} of ${totalLessons} lessons complete`
              : "Your path through this course"}
          </p>
        </div>
        {resumeLessonId ? (
          <Link
            href={`/lessons/${resumeLessonId}`}
            className="inline-flex h-10 items-center bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Resume learning
          </Link>
        ) : null}
      </div>

      {typeof progressPct === "number" && totalLessons > 0 ? (
        <div className="mt-4 space-y-1.5">
          <div className="flex justify-between text-[11px] tabular-nums text-neutral-500">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden bg-neutral-100">
            <div className="h-full bg-brand" style={{ width: `${toPercent(progressPct)}%` }} />
          </div>
        </div>
      ) : null}

      <ul className="mt-6 divide-y divide-neutral-200 border-y border-neutral-200">
        {displayModules.map((mod) => {
          const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
          if (lessons.length === 0) return null;
          const moduleHeading = displayStudentModuleTitle(mod.title);
          const moduleDone = lessons.every((l) => completed.has(l.id) || isLessonComingSoon(l));

          return (
            <li key={mod.id} className="py-4">
              {moduleHeading ? (
                <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  {moduleHeading}
                  {moduleDone ? (
                    <span className="normal-case tracking-normal text-green-700">· Complete</span>
                  ) : null}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {lessons.map((lesson) => {
                  const duration = formatLessonDuration(lesson.duration_seconds);
                  const comingSoon = isLessonComingSoon(lesson);
                  const done = completed.has(lesson.id);
                  const isLocked = !comingSoon && locked.has(lesson.id);
                  const isResume = resumeLessonId === lesson.id;
                  const Icon = comingSoon
                    ? Clock
                    : isLocked
                      ? Lock
                      : done
                        ? CheckCircle2
                        : isResume
                          ? PlayCircle
                          : Circle;

                  const row = (
                    <span
                      className={cn(
                        "flex min-h-[48px] items-center gap-3 px-1 py-2 text-sm",
                        isResume && "bg-brand/5",
                        isLocked && "opacity-60",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          done && "text-green-600",
                          comingSoon && "text-amber-600",
                          isResume && !done && "text-brand",
                          !done && !comingSoon && !isResume && "text-neutral-400",
                        )}
                      />
                      <span className="min-w-0 flex-1 font-medium text-neutral-900">
                        {displayStudentLessonTitle(lesson.title)}
                        {isResume && !done ? (
                          <span className="ml-2 text-[11px] font-semibold uppercase tracking-wide text-brand">
                            Up next
                          </span>
                        ) : null}
                      </span>
                      {comingSoon ? (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                          Soon
                        </span>
                      ) : duration ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-neutral-400">
                          {duration}
                        </span>
                      ) : null}
                    </span>
                  );

                  return (
                    <li key={lesson.id}>
                      {isLocked ? (
                        row
                      ) : (
                        <Link href={`/lessons/${lesson.id}`} className="block hover:bg-neutral-50">
                          {row}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
