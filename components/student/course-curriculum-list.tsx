"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, Clock, Lock, PlayCircle } from "lucide-react";
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
    completedIds instanceof Set ? completedIds : new Set(completedIds ?? []);
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds ?? []);
  const totalLessons = displayModules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0);
  const doneCount = [...completed].filter((id) =>
    displayModules.some((m) => m.lessons?.some((l) => l.id === id)),
  ).length;

  const resumeModuleId =
    displayModules.find((m) => m.lessons?.some((l) => l.id === resumeLessonId))?.id ??
    displayModules[0]?.id ??
    null;
  const [openId, setOpenId] = useState<string | null>(resumeModuleId);

  return (
    <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-200 px-5 py-5 sm:px-6">
        <div>
          <h2 className="font-display text-lg font-bold text-neutral-950">Course content</h2>
          <p className="mt-1 text-sm text-neutral-500">
            {totalLessons > 0
              ? `${displayModules.length} modules · ${doneCount} of ${totalLessons} lessons complete`
              : "Your path through this course"}
          </p>
        </div>
        {resumeLessonId ? (
          <Link
            href={`/lessons/${resumeLessonId}`}
            className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Start learning
          </Link>
        ) : null}
      </div>

      {typeof progressPct === "number" && totalLessons > 0 ? (
        <div className="space-y-1.5 border-b border-neutral-100 px-5 py-4 sm:px-6">
          <div className="flex justify-between text-[11px] tabular-nums text-neutral-500">
            <span>Progress</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${toPercent(progressPct)}%` }} />
          </div>
        </div>
      ) : null}

      <div className="divide-y divide-neutral-200">
        {displayModules.map((mod, index) => {
          const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
          if (lessons.length === 0) return null;
          const moduleHeading = displayStudentModuleTitle(mod.title) || `Module ${index + 1}`;
          const moduleDone = lessons.every((l) => completed.has(l.id) || isLessonComingSoon(l));
          const moduleDoneCount = lessons.filter((l) => completed.has(l.id)).length;
          const isOpen = openId === mod.id;

          return (
            <div key={mod.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : mod.id)}
                className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-neutral-50 sm:px-6"
              >
                <span className="flex min-w-0 items-baseline gap-3">
                  <span className="shrink-0 font-display text-sm tabular-nums text-neutral-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-display font-semibold text-neutral-900">
                      {moduleHeading}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-500">
                      {moduleDoneCount}/{lessons.length} lessons
                      {moduleDone ? " · Complete" : ""}
                    </span>
                  </span>
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 text-neutral-400 transition", isOpen && "rotate-180")}
                />
              </button>

              {isOpen ? (
                <ul className="border-t border-neutral-100 bg-neutral-50/70 px-3 pb-3 sm:px-4">
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
                          "flex min-h-[48px] items-center gap-3 rounded-lg px-2 py-2 text-sm",
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
                          <Link href={`/lessons/${lesson.id}`} className="block hover:bg-white/80">
                            {row}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
