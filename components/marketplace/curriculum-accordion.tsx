"use client";

import { useState } from "react";
import { ChevronDown, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Lesson = { id: string; title: string; position: number; lesson_type: string };
type Module = { id: string; title: string; position: number; lessons: Lesson[] };

export function CurriculumAccordion({ modules }: { modules: Module[] }) {
  const [openId, setOpenId] = useState<string | null>(modules[0]?.id ?? null);

  if (modules.length === 0) {
    return <p className="text-sm text-neutral-500">Curriculum coming soon.</p>;
  }

  const totalLessons = modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm text-neutral-500">
        <span>{modules.length} modules</span>
        <span>{totalLessons} lessons</span>
      </div>
      <div className="space-y-2">
        {modules.map((m) => {
          const lessons = [...(m.lessons ?? [])].sort((a, b) => a.position - b.position);
          const isOpen = openId === m.id;
          return (
            <div key={m.id} className="overflow-hidden rounded-xl border border-surface-border bg-white">
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : m.id)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="font-semibold text-neutral-900">{m.title}</span>
                <ChevronDown
                  className={cn("h-5 w-5 shrink-0 text-neutral-400 transition", isOpen && "rotate-180")}
                />
              </button>
              {isOpen ? (
                <ul className="border-t border-surface-border px-4 py-2">
                  {lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex min-h-[44px] items-center gap-3 border-b border-surface-border py-3 text-sm last:border-0"
                    >
                      <PlayCircle className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="flex-1 text-neutral-700">{l.title}</span>
                      <span className="text-xs uppercase text-neutral-400">{l.lesson_type}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
