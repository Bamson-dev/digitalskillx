"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Bookmark, FileText, Download, Maximize, PictureInPicture } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { resolveVideo } from "@/lib/video";
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
}: {
  lesson: Lesson;
  studentEmail: string;
  completed: boolean;
  note: string;
  bookmarks: BookmarkType[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{lesson.title}</h1>
        {lesson.description ? <p className="mt-1 text-sm text-muted">{lesson.description}</p> : null}
      </div>

      <LessonContent lesson={lesson} studentEmail={studentEmail} />

      <div className="flex flex-wrap items-center gap-3">
        {completed ? (
          <span className="inline-flex items-center gap-2 rounded-lg bg-green-100 px-4 py-2 text-sm font-semibold text-green-700">
            <CheckCircle2 className="h-4 w-4" /> Completed
          </span>
        ) : (
          <form action={markLessonComplete}>
            <input type="hidden" name="lesson_id" value={lesson.id} />
            <Button type="submit">
              <CheckCircle2 className="h-4 w-4" /> Mark complete
            </Button>
          </form>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <NotesPanel lessonId={lesson.id} note={note} />
        {lesson.lesson_type === "video" ? (
          <BookmarksPanel lessonId={lesson.id} bookmarks={bookmarks} />
        ) : null}
      </div>
    </div>
  );
}

function LessonContent({ lesson, studentEmail }: { lesson: Lesson; studentEmail: string }) {
  switch (lesson.lesson_type) {
    case "video":
      return <VideoContent url={lesson.content_url} requiredPct={lesson.required_watch_pct} lessonId={lesson.id} studentEmail={studentEmail} />;
    case "pdf":
      return (
        <Card className="p-0">
          {lesson.content_url ? (
            <>
              <iframe src={lesson.content_url} className="h-[70vh] w-full rounded-t-xl" title={lesson.title} />
              <div className="p-3">
                <a href={lesson.content_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-brand hover:underline">
                  <Download className="h-4 w-4" /> Download PDF
                </a>
              </div>
            </>
          ) : (
            <p className="p-6 text-sm text-muted">No PDF attached.</p>
          )}
        </Card>
      );
    case "audio":
      return (
        <Card>
          {lesson.content_url ? (
            <audio controls className="w-full" src={lesson.content_url} />
          ) : (
            <p className="text-sm text-muted">No audio attached.</p>
          )}
        </Card>
      );
    case "text":
      return (
        <Card>
          <article
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: lesson.content_text ?? "<p>No content yet.</p>" }}
          />
        </Card>
      );
    case "slides":
    case "embed":
      return (
        <Card className="p-0">
          {lesson.content_url ? (
            <iframe src={lesson.content_url} className="h-[70vh] w-full rounded-xl" title={lesson.title} allowFullScreen />
          ) : (
            <p className="p-6 text-sm text-muted">No embed URL set.</p>
          )}
        </Card>
      );
    case "download":
      return (
        <Card className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm">
            <FileText className="h-5 w-5 text-brand" /> {lesson.title}
          </span>
          {lesson.content_url ? (
            <a href={lesson.content_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">
              <Download className="h-4 w-4" /> Download
            </a>
          ) : (
            <span className="text-sm text-muted">No file</span>
          )}
        </Card>
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

  // For direct-file videos we can track real watch percentage.
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

  if (!video) return <Card className="text-sm text-muted">No video set for this lesson.</Card>;

  return (
    <div className="relative overflow-hidden rounded-xl bg-black">
      {/* Lightweight email watermark overlay (PRD §20). */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded bg-black/40 px-2 py-0.5 text-[10px] text-white/70">
        {studentEmail}
      </div>

      {video.provider === "file" ? (
        <div>
          <video ref={fileRef} controls className="aspect-video w-full" src={video.embedUrl} controlsList="nodownload" />
          <FileVideoControls videoRef={fileRef} />
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
    <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 text-xs text-white">
      <span>Speed:</span>
      {speeds.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => videoRef.current && (videoRef.current.playbackRate = s)}
          className="rounded px-1.5 py-0.5 hover:bg-white/10"
        >
          {s}x
        </button>
      ))}
      <button
        type="button"
        onClick={() => {
          const el = videoRef.current as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null;
          el?.requestPictureInPicture?.();
        }}
        className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10"
      >
        <PictureInPicture className="h-3.5 w-3.5" /> PiP
      </button>
      <button
        type="button"
        onClick={() => videoRef.current?.requestFullscreen()}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-white/10"
      >
        <Maximize className="h-3.5 w-3.5" /> Full
      </button>
    </div>
  );
}

function NotesPanel({ lessonId, note }: { lessonId: string; note: string }) {
  return (
    <Card>
      <CardHeader title="My notes" description="Saved privately to your account." />
      <form action={saveLessonNote} className="space-y-2">
        <input type="hidden" name="lesson_id" value={lessonId} />
        <Textarea name="content" rows={6} defaultValue={note} placeholder="Type your notes for this lesson…" />
        <Button type="submit" size="sm">
          Save notes
        </Button>
      </form>
    </Card>
  );
}

function BookmarksPanel({ lessonId, bookmarks }: { lessonId: string; bookmarks: BookmarkType[] }) {
  const [m, setM] = useState("0");
  const [s, setS] = useState("0");

  return (
    <Card>
      <CardHeader title="Bookmarks" description="Save timestamps to revisit." />
      <form action={addBookmark} className="mb-3 flex items-end gap-2">
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input
          type="hidden"
          name="timestamp_seconds"
          value={String(Number(m) * 60 + Number(s))}
        />
        <div className="w-16">
          <label className="mb-1 block text-xs text-muted">Min</label>
          <Input value={m} onChange={(e) => setM(e.target.value)} type="number" min={0} className="h-8" />
        </div>
        <div className="w-16">
          <label className="mb-1 block text-xs text-muted">Sec</label>
          <Input value={s} onChange={(e) => setS(e.target.value)} type="number" min={0} max={59} className="h-8" />
        </div>
        <Input name="label" placeholder="Label (optional)" className="h-8 flex-1" />
        <Button type="submit" size="sm" variant="outline">
          <Bookmark className="h-4 w-4" />
        </Button>
      </form>
      <ul className="space-y-1">
        {bookmarks.map((b) => (
          <li key={b.id} className="flex items-center justify-between rounded-lg bg-brand-50/40 px-3 py-1.5 text-sm">
            <span>
              {Math.floor(b.timestamp_seconds / 60)}:{String(b.timestamp_seconds % 60).padStart(2, "0")}{" "}
              {b.label ? <span className="text-muted">· {b.label}</span> : null}
            </span>
            <form action={deleteBookmark}>
              <input type="hidden" name="id" value={b.id} />
              <input type="hidden" name="lesson_id" value={lessonId} />
              <button type="submit" className="text-xs text-red-600 hover:underline">
                Remove
              </button>
            </form>
          </li>
        ))}
        {bookmarks.length === 0 ? <li className="text-sm text-muted">No bookmarks yet.</li> : null}
      </ul>
    </Card>
  );
}
