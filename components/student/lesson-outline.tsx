"use client";

import { useEffect, useMemo, useRef } from "react";
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

export function LessonOutline({
  courseId,
  courseTitle,
  modules,
  currentLessonId,
  completedIds,
  lockedIds,
  progressPct,
  lessonIndex,
  totalLessons,
}: {
  courseId: string;
  courseTitle: string;
  modules: ModuleWithLessons[];
  currentLessonId: string;
  completedIds: Set<string>;
  lockedIds: Set<string>;
  progressPct?: number;
  lessonIndex?: number;
  totalLessons?: number;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  const displayModules = useMemo(() => normalizeOutlineModules(modules), [modules]);

  useEffect(() => {
    const node = activeRef.current;
    const container = listRef.current;
    if (!node || !container) return;
    const frame = requestAnimationFrame(() => {
      const mobile = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
      node.scrollIntoView({ block: mobile ? "center" : "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentLessonId, displayModules]);

  return (
    <nav className="flex h-full min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-2 border-b border-neutral-200 pb-3">
        <Link
          href={`/courses/${courseId}`}
          className="block font-display text-sm font-bold leading-snug text-neutral-900 hover:text-brand"
        >
          {courseTitle}
        </Link>
        {typeof progressPct === "number" && typeof totalLessons === "number" && totalLessons > 0 ? (
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] tabular-nums text-neutral-500">
              <span>
                {lessonIndex ?? 0} / {totalLessons}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="h-1 overflow-hidden bg-neutral-100">
              <div className="h-full bg-brand" style={{ width: `${toPercent(progressPct)}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6">
        {displayModules.map((mod) => {
          const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
          if (lessons.length === 0) return null;
          const moduleHeading = displayStudentModuleTitle(mod.title);

          return (
            <div key={mod.id} className={moduleHeading ? "mt-4 first:mt-0" : ""}>
              {moduleHeading ? (
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                  {moduleHeading}
                </p>
              ) : null}
              <ul className="space-y-0.5">
                {lessons.map((lesson) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const done = completedIds.has(lesson.id);
                  const comingSoon = isLessonComingSoon(lesson);
                  const locked = !comingSoon && lockedIds.has(lesson.id);
                  const Icon = done
                    ? CheckCircle2
                    : comingSoon
                      ? Clock
                      : locked
                        ? Lock
                        : isCurrent
                          ? PlayCircle
                          : Circle;
                  const duration = formatLessonDuration(lesson.duration_seconds);
                  const label = displayStudentLessonTitle(lesson.title);

                  const inner = (
                    <span
                      className={cn(
                        "flex min-h-[44px] items-center gap-2.5 px-2 py-2 text-sm leading-snug",
                        isCurrent && "bg-brand text-white",
                        !isCurrent && !locked && "text-neutral-800 hover:bg-neutral-50",
                        done && !isCurrent && "text-neutral-700",
                        locked && "text-neutral-400",
                        comingSoon && !isCurrent && "text-amber-800",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          done && !isCurrent && "text-green-600",
                          comingSoon && !isCurrent && "text-amber-600",
                          isCurrent && "text-white",
                        )}
                      />
                      <span className="min-w-0 flex-1">{label}</span>
                      {comingSoon ? (
                        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                          Soon
                        </span>
                      ) : duration ? (
                        <span
                          className={cn(
                            "shrink-0 text-[11px] tabular-nums",
                            isCurrent ? "text-white/80" : "text-neutral-400",
                          )}
                        >
                          {duration}
                        </span>
                      ) : null}
                    </span>
                  );

                  return (
                    <li key={lesson.id} ref={isCurrent ? activeRef : undefined}>
                      {locked ? inner : <Link href={`/lessons/${lesson.id}`}>{inner}</Link>}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
