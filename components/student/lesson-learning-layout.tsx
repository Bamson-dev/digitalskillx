"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, List } from "lucide-react";
import { LessonOutline } from "@/components/student/lesson-outline";
import { Sheet } from "@/components/ui/sheet";
import { toPercent } from "@/lib/utils";
import type { ModuleWithLessons } from "@/lib/lesson-display";

export function LessonLearningLayout({
  courseId,
  courseTitle,
  modules,
  currentLessonId,
  completedIds,
  lockedIds,
  progressPct,
  lessonIndex,
  totalLessons,
  children,
}: {
  courseId: string;
  courseTitle: string;
  modules: ModuleWithLessons[];
  currentLessonId: string;
  completedIds: Set<string> | string[];
  lockedIds: Set<string> | string[];
  progressPct: number;
  lessonIndex: number;
  totalLessons: number;
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const completed =
    completedIds instanceof Set ? completedIds : new Set(completedIds);
  const locked = lockedIds instanceof Set ? lockedIds : new Set(lockedIds);

  const outline = (
    <LessonOutline
      courseId={courseId}
      courseTitle={courseTitle}
      modules={modules}
      currentLessonId={currentLessonId}
      completedIds={completed}
      lockedIds={locked}
      progressPct={progressPct}
      lessonIndex={lessonIndex}
      totalLessons={totalLessons}
    />
  );

  return (
    <div className="grid min-w-0 gap-0 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-8">
      <aside className="order-2 hidden min-w-0 border-r border-neutral-200 pr-4 lg:order-1 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-hidden">
        {outline}
      </aside>

      <div className="order-1 min-w-0 overflow-x-hidden lg:order-2">
        {/* Mobile classroom chrome */}
        <div className="sticky top-12 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:backdrop-blur-none lg:hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Link
              href={`/courses/${courseId}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-neutral-600 hover:text-brand"
              aria-label="Back to course"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-neutral-900">{courseTitle}</p>
              <p className="text-[11px] tabular-nums text-neutral-500">
                Lesson {lessonIndex} of {totalLessons}
                {totalLessons > 0 ? ` · ${progressPct}%` : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800"
            >
              <List className="h-4 w-4" />
              Lessons
            </button>
          </div>
          <div className="h-0.5 bg-neutral-100">
            <div
              className="h-full bg-brand transition-all"
              style={{ width: `${toPercent(progressPct)}%` }}
            />
          </div>
        </div>

        {children}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Lessons" side="bottom">
        <div
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.closest("a")) setSheetOpen(false);
          }}
        >
          {outline}
        </div>
      </Sheet>
    </div>
  );
}
