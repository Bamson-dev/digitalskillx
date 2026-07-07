"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";
import {
  formatLessonDuration,
  isGenericImportModuleTitle,
  normalizeOutlineModules,
  type ModuleWithLessons,
} from "@/lib/lesson-display";
import { cn } from "@/lib/utils";

export function LessonOutline({
  courseId,
  courseTitle,
  modules,
  currentLessonId,
  completedIds,
  lockedIds,
}: {
  courseId: string;
  courseTitle: string;
  modules: ModuleWithLessons[];
  currentLessonId: string;
  completedIds: Set<string>;
  lockedIds: Set<string>;
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
      node.scrollIntoView({ block: mobile ? "start" : "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentLessonId, displayModules]);

  return (
    <nav className="flex flex-col gap-2">
      <Link href={`/courses/${courseId}`} className="block text-sm font-semibold leading-tight hover:text-brand">
        {courseTitle}
      </Link>

      <div ref={listRef} className="max-h-[min(36vh,16rem)] overflow-y-auto overscroll-contain sm:max-h-[min(42vh,22rem)] lg:max-h-[calc(100vh-7rem)]">
        {displayModules.map((mod) => {
          const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
          if (lessons.length === 0) return null;
          const showModuleHeading =
            mod.title.trim().length > 0 && !isGenericImportModuleTitle(mod.title);

          return (
            <div key={mod.id} className={showModuleHeading ? "mt-2 first:mt-0" : ""}>
              {showModuleHeading ? (
                <p className="mb-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {mod.title}
                </p>
              ) : null}
              <ul>
                {lessons.map((lesson) => {
                  const isCurrent = lesson.id === currentLessonId;
                  const done = completedIds.has(lesson.id);
                  const locked = lockedIds.has(lesson.id);
                  const Icon = done ? CheckCircle2 : locked ? Lock : isCurrent ? PlayCircle : Circle;
                  const duration = formatLessonDuration(lesson.duration_seconds);
                  const label = lesson.title?.trim() || "Untitled lesson";

                  const inner = (
                    <span
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1 py-0.5 text-sm leading-tight",
                        isCurrent
                          ? "bg-brand-50 font-medium text-brand-700"
                          : "text-foreground hover:bg-brand-50/50",
                        locked && "text-muted",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          done && "text-green-600",
                          isCurrent && !done && "text-brand-600",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      {duration ? (
                        <span className="shrink-0 text-[11px] tabular-nums text-muted">{duration}</span>
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
