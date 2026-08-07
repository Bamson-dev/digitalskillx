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

/**
 * Non-primary course tools. Collapsed by default so the Course Editor
 * stays focused on settings + curriculum. Existing YouTube lessons are
 * unaffected — this only hides the bulk-import UI.
 */
export function CourseAdvancedTools({
  courseId,
  modules,
}: {
  courseId: string;
  modules: ModuleOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">Advanced Tools</span>
            <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Optional
            </span>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Developer utilities — bulk import from a YouTube playlist or single video (Vimeo,
            Wistia, Loom supported). Not required for day-to-day course building.
          </p>
        </div>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="border-t border-dashed border-slate-300 bg-white px-5 pb-5 pt-4">
          <YoutubeImport courseId={courseId} modules={modules} />
        </div>
      ) : null}
    </div>
  );
}
