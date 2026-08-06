"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { YoutubeImport } from "@/components/admin/youtube-import";
import { cn } from "@/lib/utils";

type ModuleOption = {
  id: string;
  title: string;
  lessons: Array<{ id: string; title: string; youtube_video_id: string | null }>;
};

export function CourseAdvancedTools({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ModuleOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-dashed border-app bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <div className="font-semibold">Advanced Tools</div>
          <p className="mt-0.5 text-sm text-muted">
            Bulk import lessons from a YouTube playlist or channel.
          </p>
        </div>
        <ChevronDown
          className={cn("h-5 w-5 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-app px-5 pb-5 pt-4">
          <YoutubeImport courseId={courseId} modules={modules} />
        </div>
      ) : null}
    </div>
  );
}
