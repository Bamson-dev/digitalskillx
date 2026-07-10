import Link from "next/link";
import { Clock, PlayCircle } from "lucide-react";
import {
  displayStudentLessonTitle,
  displayStudentModuleTitle,
  formatLessonDuration,
  normalizeOutlineModules,
  type ModuleWithLessons,
} from "@/lib/lesson-display";
import { isLessonComingSoon } from "@/lib/lesson-coming-soon";
import { Card } from "@/components/ui/card";

export function CourseCurriculumList({ modules }: { modules: ModuleWithLessons[] }) {
  const displayModules = normalizeOutlineModules(modules);

  return (
    <Card className="p-4 sm:p-5">
      <ul className="space-y-3">
        {displayModules.map((mod) => {
          const lessons = [...(mod.lessons ?? [])].sort((a, b) => a.position - b.position);
          if (lessons.length === 0) return null;
          const moduleHeading = displayStudentModuleTitle(mod.title);

          return (
            <li key={mod.id}>
              {moduleHeading ? (
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {moduleHeading}
                </p>
              ) : null}
              <ul>
                {lessons.map((lesson) => {
                  const duration = formatLessonDuration(lesson.duration_seconds);
                  const comingSoon = isLessonComingSoon(lesson);
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/lessons/${lesson.id}`}
                        className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm leading-tight hover:bg-brand-50/50 hover:text-brand"
                      >
                        {comingSoon ? (
                          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        ) : (
                          <PlayCircle className="h-3.5 w-3.5 shrink-0 text-muted" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                          {displayStudentLessonTitle(lesson.title)}
                        </span>
                        {comingSoon ? (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Soon
                          </span>
                        ) : duration ? (
                          <span className="shrink-0 text-[11px] tabular-nums text-muted">{duration}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
