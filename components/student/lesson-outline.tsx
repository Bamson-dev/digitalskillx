import Link from "next/link";
import { CheckCircle2, Circle, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lesson, Module } from "@/types/database";

type ModuleWithLessons = Module & { lessons: Lesson[] };

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
  return (
    <nav className="space-y-4">
      <Link href={`/courses/${courseId}`} className="block text-sm font-semibold hover:text-brand">
        {courseTitle}
      </Link>
      {modules.map((m) => {
        const lessons = [...(m.lessons ?? [])].sort((a, b) => a.position - b.position);
        return (
          <div key={m.id}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{m.title}</p>
            <ul className="space-y-0.5">
              {lessons.map((l) => {
                const isCurrent = l.id === currentLessonId;
                const done = completedIds.has(l.id);
                const locked = lockedIds.has(l.id);
                const Icon = done ? CheckCircle2 : locked ? Lock : isCurrent ? PlayCircle : Circle;
                const inner = (
                  <span
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm",
                      isCurrent ? "bg-brand-50 font-medium text-brand-700" : "text-foreground hover:bg-brand-50/50",
                      locked && "text-muted",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", done && "text-green-600")} />
                    <span className="truncate">{l.title}</span>
                  </span>
                );
                return (
                  <li key={l.id}>
                    {locked ? inner : <Link href={`/lessons/${l.id}`}>{inner}</Link>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
