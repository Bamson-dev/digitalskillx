"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Maximize,
  PictureInPicture,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { resolveVideo, youtubeLessonEmbedUrl } from "@/lib/video";
import { displayStudentLessonTitle } from "@/lib/lesson-display";
import { siteUrl } from "@/lib/org";
import { cn } from "@/lib/utils";
import type { Lesson, Bookmark as BookmarkType } from "@/types/database";
import {
  markLessonComplete,
  saveLessonNote,
  addBookmark,
  deleteBookmark,
  updateWatchProgress,
} from "@/app/(student)/lessons/actions";

export function LessonPlayer({
  lesson,
  studentEmail,
  completed,
  note,
  bookmarks,
  lessonIndex,
  totalLessons,
  prevLessonId,
  nextLessonId,
}: {
  lesson: Lesson;
  studentEmail: string;
  completed: boolean;
  note: string;
  bookmarks: BookmarkType[];
  lessonIndex: number;
  totalLessons: number;
  prevLessonId?: string | null;
  nextLessonId?: string | null;
}) {
  const lessonTitle = displayStudentLessonTitle(lesson.title);

  return (
    <div className="space-y-0">
      <LessonContent lesson={lesson} studentEmail={studentEmail} />

      <div className="space-y-5 px-4 pt-5 sm:px-0 sm:pt-6">
        <header className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Lesson {lessonIndex} of {totalLessons}
          </p>
          <h1 className="font-display text-xl font-bold leading-tight tracking-tight text-neutral-950 sm:text-2xl lg:text-3xl">
            {lessonTitle}
          </h1>
          {lesson.description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-neutral-600">{lesson.description}</p>
          ) : null}
        </header>

        {/* Desktop / tablet actions */}
        <div className="hidden flex-wrap items-center gap-3 sm:flex">
          {completed ? (
            <span className="inline-flex h-11 items-center gap-2 bg-green-50 px-4 text-sm font-semibold text-green-800">
              <CheckCircle2 className="h-4 w-4" />
              Completed
            </span>
          ) : (
            <form action={markLessonComplete}>
              <input type="hidden" name="lesson_id" value={lesson.id} />
              <Button type="submit" className="h-11 rounded-none px-5">
                <CheckCircle2 className="h-4 w-4" />
                Mark complete
              </Button>
            </form>
          )}
          {nextLessonId ? (
            <Link
              href={`/lessons/${nextLessonId}`}
              className={cn(
                "inline-flex h-11 items-center gap-2 px-5 text-sm font-semibold",
                completed
                  ? "bg-brand text-white hover:bg-brand-700"
                  : "border border-neutral-200 text-neutral-800 hover:border-neutral-400",
              )}
            >
              Next lesson
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
          {prevLessonId ? (
            <Link
              href={`/lessons/${prevLessonId}`}
              className="inline-flex h-11 items-center gap-1.5 px-2 text-sm font-medium text-neutral-500 hover:text-neutral-900"
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Link>
          ) : null}
        </div>

        <div className="space-y-3 border-t border-neutral-200 pt-2">
          <NotesPanel lessonId={lesson.id} note={note} />
          {lesson.lesson_type === "video" ? (
            <BookmarksPanel lessonId={lesson.id} bookmarks={bookmarks} />
          ) : null}
        </div>
      </div>

      {/* Mobile sticky study bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          {prevLessonId ? (
            <Link
              href={`/lessons/${prevLessonId}`}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-neutral-200 text-neutral-700"
              aria-label="Previous lesson"
            >
              <ChevronLeft className="h-5 w-5" />
            </Link>
          ) : (
            <div className="h-12 w-12 shrink-0" aria-hidden />
          )}

          {completed ? (
            nextLessonId ? (
              <Link
                href={`/lessons/${nextLessonId}`}
                className="inline-flex h-12 min-h-[48px] flex-1 items-center justify-center gap-2 bg-brand text-sm font-bold text-white"
              >
                Next lesson
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex h-12 flex-1 items-center justify-center gap-2 bg-green-50 text-sm font-semibold text-green-800">
                <CheckCircle2 className="h-4 w-4" />
                Course progress saved
              </span>
            )
          ) : (
            <form action={markLessonComplete} className="flex-1">
              <input type="hidden" name="lesson_id" value={lesson.id} />
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center gap-2 bg-brand text-sm font-bold text-white"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark complete
              </button>
            </form>
          )}

          {nextLessonId && !completed ? (
            <Link
              href={`/lessons/${nextLessonId}`}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center border border-neutral-200 text-neutral-700"
              aria-label="Next lesson"
            >
              <ChevronRight className="h-5 w-5" />
            </Link>
          ) : nextLessonId && completed ? (
            <div className="w-0" aria-hidden />
          ) : (
            <div className="h-12 w-12 shrink-0" aria-hidden />
          )}
        </div>
      </div>
    </div>
  );
}

function LessonContent({ lesson, studentEmail }: { lesson: Lesson; studentEmail: string }) {
  const lessonTitle = displayStudentLessonTitle(lesson.title);
  switch (lesson.lesson_type) {
    case "video":
      return (
        <VideoContent
          url={lesson.content_url}
          requiredPct={lesson.required_watch_pct}
          lessonId={lesson.id}
          studentEmail={studentEmail}
        />
      );
    case "pdf":
      return (
        <div className="overflow-hidden border-y border-neutral-200 bg-white sm:border">
          {lesson.content_url ? (
            <>
              <iframe src={lesson.content_url} className="h-[70vh] w-full" title={lessonTitle} />
              <div className="border-t border-neutral-200 px-4 py-3">
                <a
                  href={lesson.content_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-brand"
                >
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-neutral-500">No PDF attached.</p>
          )}
        </div>
      );
    case "audio":
      return (
        <div className="border-y border-neutral-200 bg-white px-4 py-6 sm:border sm:px-5">
          {lesson.content_url ? (
            <audio controls className="w-full" src={lesson.content_url} />
          ) : (
            <p className="text-sm text-neutral-500">No audio attached.</p>
          )}
        </div>
      );
    case "text":
      return (
        <article
          className="prose prose-neutral max-w-none border-y border-neutral-200 bg-white px-4 py-6 prose-p:text-neutral-700 sm:border sm:px-6"
          dangerouslySetInnerHTML={{ __html: lesson.content_text ?? "<p>No content yet.</p>" }}
        />
      );
    case "slides":
    case "embed":
      return (
        <div className="overflow-hidden border-y border-neutral-200 bg-black sm:border">
          {lesson.content_url ? (
            <iframe
              src={lesson.content_url}
              className="h-[70vh] w-full"
              title={lessonTitle}
              allowFullScreen
            />
          ) : (
            <p className="bg-white p-6 text-sm text-neutral-500">No embed URL set.</p>
          )}
        </div>
      );
    case "download":
      return (
        <div className="flex items-center justify-between gap-4 border-y border-neutral-200 bg-white px-4 py-5 sm:border sm:px-5">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <FileText className="h-5 w-5 shrink-0 text-brand" />
            <span className="truncate">{lessonTitle}</span>
          </span>
          {lesson.content_url ? (
            <a
              href={lesson.content_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 bg-brand px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Download className="h-4 w-4" /> Download
            </a>
          ) : (
            <span className="text-sm text-neutral-500">No file</span>
          )}
        </div>
      );
    default:
      return null;
  }
}

function VideoContent({
  url,
  requiredPct,
  lessonId,
  studentEmail,
}: {
  url: string | null;
  requiredPct: number;
  lessonId: string;
  studentEmail: string;
}) {
  const video = resolveVideo(url);
  const fileRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);

  useEffect(() => {
    const el = fileRef.current;
    if (!el) return;
    const onTime = () => {
      if (!el.duration) return;
      const pct = Math.round((el.currentTime / el.duration) * 100);
      if (!reported.current && requiredPct > 0 && pct >= requiredPct) {
        reported.current = true;
        void updateWatchProgress(lessonId, pct, requiredPct);
      }
    };
    el.addEventListener("timeupdate", onTime);
    return () => el.removeEventListener("timeupdate", onTime);
  }, [lessonId, requiredPct]);

  if (!video) {
    return (
      <div className="border-y border-neutral-200 bg-neutral-50 px-4 py-10 text-sm text-neutral-500 sm:border">
        No video set for this lesson.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden bg-black sm:border sm:border-neutral-200">
      <div className="pointer-events-none absolute right-3 top-3 z-10 bg-black/45 px-2 py-0.5 text-[10px] text-white/70">
        {studentEmail}
      </div>

      {video.provider === "file" ? (
        <div>
          <video
            ref={fileRef}
            controls
            className="aspect-video w-full"
            src={video.embedUrl}
            controlsList="nodownload"
            playsInline
          />
          <FileVideoControls videoRef={fileRef} />
        </div>
      ) : video.provider === "youtube" ? (
        <div className="relative aspect-video">
          <div className="pointer-events-auto absolute left-0 top-0 z-[5] h-12 w-28" aria-hidden />
          <iframe
            src={youtubeLessonEmbedUrl(video.id, siteUrl())}
            className="aspect-video w-full"
            title="Lesson video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <iframe
          src={video.embedUrl}
          className="aspect-video w-full"
          title="Lesson video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      )}
    </div>
  );
}

function FileVideoControls({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement> }) {
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  return (
    <div className="flex items-center gap-2 bg-neutral-950 px-3 py-2 text-xs text-white">
      <span className="text-white/60">Speed</span>
      {speeds.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => videoRef.current && (videoRef.current.playbackRate = s)}
          className="px-1.5 py-0.5 hover:bg-white/10"
        >
          {s}x
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          const el = videoRef.current as
            | (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> })
            | null;
          el?.requestPictureInPicture?.();
        }}
        className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/10"
      >
        <PictureInPicture className="h-3.5 w-3.5" /> PiP
      </button>
      <button
        type="button"
        onClick={() => videoRef.current?.requestFullscreen()}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 hover:bg-white/10"
      >
        <Maximize className="h-3.5 w-3.5" /> Full
      </button>
    </div>
  );
}

function ToolsDisclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 py-3 text-left"
      >
        <span className="font-display text-sm font-bold text-neutral-900">{title}</span>
        <ChevronDown className={cn("h-4 w-4 text-neutral-400 transition", open && "rotate-180")} />
      </button>
      {open ? <div className="pb-4">{children}</div> : null}
    </div>
  );
}

function NotesPanel({ lessonId, note }: { lessonId: string; note: string }) {
  return (
    <ToolsDisclosure title="My notes" defaultOpen={Boolean(note)}>
      <form action={saveLessonNote} className="space-y-3">
        <input type="hidden" name="lesson_id" value={lessonId} />
        <Textarea
          name="content"
          rows={5}
          defaultValue={note}
          placeholder="Capture what you want to remember…"
          className="rounded-none border-neutral-200"
        />
        <Button type="submit" size="sm" className="rounded-none">
          Save notes
        </Button>
      </form>
    </ToolsDisclosure>
  );
}

function BookmarksPanel({ lessonId, bookmarks }: { lessonId: string; bookmarks: BookmarkType[] }) {
  const [m, setM] = useState("0");
  const [s, setS] = useState("0");

  return (
    <ToolsDisclosure title="Bookmarks" defaultOpen={bookmarks.length > 0}>
      <form action={addBookmark} className="mb-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="timestamp_seconds" value={String(Number(m) * 60 + Number(s))} />
        <div className="w-16">
          <label className="mb-1 block text-xs text-neutral-500">Min</label>
          <Input value={m} onChange={(e) => setM(e.target.value)} type="number" min={0} className="h-10 rounded-none" />
        </div>
        <div className="w-16">
          <label className="mb-1 block text-xs text-neutral-500">Sec</label>
          <Input
            value={s}
            onChange={(e) => setS(e.target.value)}
            type="number"
            min={0}
            max={59}
            className="h-10 rounded-none"
          />
        </div>
        <Input name="label" placeholder="Label (optional)" className="h-10 min-w-[8rem] flex-1 rounded-none" />
        <Button type="submit" size="sm" variant="outline" className="h-10 rounded-none">
          <Bookmark className="h-4 w-4" />
          Save
        </Button>
      </form>
      <ul className="divide-y divide-neutral-100">
        {bookmarks.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <span>
              <span className="font-medium tabular-nums">
                {Math.floor(b.timestamp_seconds / 60)}:{String(b.timestamp_seconds % 60).padStart(2, "0")}
              </span>
              {b.label ? <span className="text-neutral-500"> · {b.label}</span> : null}
            </span>
            <form action={deleteBookmark}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="lesson_id" value={lessonId} />
              <button type="submit" className="text-xs font-medium text-neutral-500 hover:text-brand">
                Remove
              </button>
            </form>
          </li>
        ))}
        {bookmarks.length === 0 ? (
          <li className="py-1 text-sm text-neutral-500">No bookmarks yet.</li>
        ) : null}
      </ul>
    </ToolsDisclosure>
  );
}
