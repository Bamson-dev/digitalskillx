"use client";

import { useTransition } from "react";
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

  const onComplete = () => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("lesson_id", lessonId);
      await markLessonComplete(fd);
      dispatchClassroomMoment("lesson_complete", { dedupeKey: `lesson:${lessonId}` });
    });
  };

  if (variant === "mobile") {
    return (
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
    );
  }

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={onComplete}
      className={cn("h-11 rounded-none px-5", className)}
    >
      <CheckCircle2 className="h-4 w-4" />
      {pending ? "Saving…" : "Mark complete"}
    </Button>
  );
}
