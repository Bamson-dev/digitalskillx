"use client";

import { useEffect, useState } from "react";
import { LEARN_PROGRESS_EVENT, learnProgressStorageKey } from "@/lib/content-factory/library-shared";

export function LessonProgressToggle({
  slug,
  pathId,
  lessonId,
}: {
  slug: string;
  pathId: string;
  lessonId: string;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(learnProgressStorageKey(slug));
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      setDone(Boolean(parsed[lessonId]));
    } catch {
      setDone(false);
    }
  }, [slug, lessonId]);

  function toggle() {
    const nextDone = !done;
    try {
      const raw = window.localStorage.getItem(learnProgressStorageKey(slug));
      const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
      const next = { ...parsed, [lessonId]: nextDone };
      window.localStorage.setItem(learnProgressStorageKey(slug), JSON.stringify(next));
      window.dispatchEvent(new CustomEvent(LEARN_PROGRESS_EVENT, { detail: { slug } }));
      setDone(nextDone);
    } catch {
      setDone(nextDone);
    }

    void fetch("/api/learn/progress", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        learningPathId: pathId,
        lessonNumber: lessonId,
        completed: nextDone,
      }),
    }).catch(() => {
      /* local progress remains usable if sync fails */
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="mt-2 text-xs text-muted hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      aria-pressed={done}
      aria-label={done ? "Mark lesson incomplete" : "Mark lesson complete"}
    >
      {done ? "Completed" : "Mark complete"}
    </button>
  );
}
