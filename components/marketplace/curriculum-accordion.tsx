"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
      <p className="mb-6 text-sm text-neutral-400">
        <span className="font-semibold tabular-nums text-neutral-800">{modules.length}</span> modules ·{" "}
        <span className="font-semibold tabular-nums text-neutral-800">{totalLessons}</span> lessons
      </p>
      <div className="divide-y divide-neutral-200 border-y border-neutral-200">
        {modules.map((m, index) => {
          const lessons = [...(m.lessons ?? [])].sort((a, b) => a.position - b.position);
          const isOpen = openId === m.id;
          return (
            <div key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : m.id)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 py-4 text-left transition hover:bg-neutral-50"
              >
                <span className="flex min-w-0 items-baseline gap-4">
                  <span className="shrink-0 font-display text-sm tabular-nums text-neutral-300">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display font-semibold text-neutral-900">{m.title}</span>
                </span>
                <span className="flex shrink-0 items-center gap-3 text-xs text-neutral-400">
                  {lessons.length} lessons
                  <ChevronDown
                    className={cn("h-4 w-4 transition", isOpen && "rotate-180")}
                  />
                </span>
              </button>
              {isOpen ? (
                <ul className="border-t border-neutral-100 bg-neutral-50/50 pb-3 pl-10 pr-2">
                  {lessons.map((l) => (
                    <li
                      key={l.id}
                      className="flex min-h-[44px] items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 text-neutral-600">{l.title}</span>
                      <span className="shrink-0 text-[11px] uppercase tracking-wider text-neutral-400">
                        {l.lesson_type}
                      </span>
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
