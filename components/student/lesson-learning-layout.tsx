"use client";

import { useState } from "react";
import { List } from "lucide-react";
import { LessonOutline } from "@/components/student/lesson-outline";
import { Sheet } from "@/components/ui/sheet";
import type { ModuleWithLessons } from "@/lib/lesson-display";

export function LessonLearningLayout({
  courseId,
  courseTitle,
  modules,
  currentLessonId,
  completedIds,
  lockedIds,
  children,
}: {
  courseId: string;
  courseTitle: string;
  modules: ModuleWithLessons[];
  currentLessonId: string;
  completedIds: Set<string> | string[];
  lockedIds: Set<string> | string[];
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
    />
  );

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[240px_1fr] lg:gap-6">
      <aside className="order-2 hidden min-w-0 lg:order-1 lg:sticky lg:top-20 lg:block lg:self-start">
        {outline}
      </aside>

      <div className="order-1 min-w-0 overflow-x-hidden lg:order-2">
        <div className="mb-3 flex items-center justify-between gap-3 lg:hidden">
          <p className="truncate text-sm font-semibold text-neutral-800">{courseTitle}</p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-surface-border bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            <List className="h-4 w-4" />
            Curriculum
          </button>
        </div>
        {children}
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Curriculum" side="bottom">
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
