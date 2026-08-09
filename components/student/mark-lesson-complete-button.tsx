"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markLessonComplete } from "@/app/(student)/lessons/actions";
import { dispatchClassroomMoment } from "@/lib/classroom-engagement";
import { cn } from "@/lib/utils";

export function MarkLessonCompleteButton({
  lessonId,
  className,
  variant = "desktop",
}: {
  lessonId: string;
  className?: string;
  variant?: "desktop" | "mobile";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onComplete = () => {
    setError(null);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("lesson_id", lessonId);
        await markLessonComplete(fd);
        dispatchClassroomMoment("lesson_complete", { dedupeKey: `lesson:${lessonId}` });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not mark this lesson complete. Try again.");
      }
    });
  };

  if (variant === "mobile") {
    return (
      <div className="w-full">
        <button
          type="button"
          disabled={pending}
          onClick={onComplete}
          className={cn(
            "inline-flex h-12 w-full items-center justify-center gap-2 bg-brand text-sm font-bold text-white disabled:opacity-70",
            className,
          )}
        >
          <CheckCircle2 className="h-4 w-4" />
          {pending ? "Saving…" : "Mark complete"}
        </button>
        {error ? <p className="mt-1 px-1 text-center text-xs text-red-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        disabled={pending}
        onClick={onComplete}
        className={cn("h-11 rounded-none px-5", className)}
      >
        <CheckCircle2 className="h-4 w-4" />
        {pending ? "Saving…" : "Mark complete"}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
