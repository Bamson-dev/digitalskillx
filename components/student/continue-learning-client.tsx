"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getContinuityCourse,
  listContinuityCourses,
  type ContinuityCourseSnapshot,
  type ContinuityLessonSnapshot,
} from "@/lib/course-continuity/offline-store";
import { resolveVideo } from "@/lib/video";

function lessonVideoSrc(lesson: ContinuityLessonSnapshot): string | null {
  const url = lesson.videoUrl?.trim();
  if (!url) return null;
  return resolveVideo(url)?.embedUrl ?? url;
}

export function ContinueLearningClient() {
  const [courses, setCourses] = useState<ContinuityCourseSnapshot[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listContinuityCourses();
      if (cancelled) return;
      setCourses(rows);
      if (rows[0]) {
        setActiveCourseId(rows[0].id);
        const firstLesson = rows[0].modules
          .flatMap((m) => m.lessons)
          .sort((a, b) => a.position - b.position)[0];
        setActiveLessonId(firstLesson?.id ?? null);
      }
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) ?? null,
    [courses, activeCourseId],
  );

  const lessons = useMemo(() => {
    if (!activeCourse) return [] as ContinuityLessonSnapshot[];
    return activeCourse.modules
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((m) =>
        m.lessons.slice().sort((a, b) => a.position - b.position),
      );
  }, [activeCourse]);

  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? null;
  const embed = activeLesson ? lessonVideoSrc(activeLesson) : null;

  useEffect(() => {
    if (!activeCourseId) return;
    void getContinuityCourse(activeCourseId);
  }, [activeCourseId]);

  if (!ready) {
    return (
      <p className="text-sm text-muted-foreground">Loading saved courses…</p>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          No saved classroom copy on this device yet. Open your course once while
          online, then this page can keep you learning during outages.
        </p>
        <Link href="/login" className="text-sm font-semibold text-primary underline">
          Sign in to open your course
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {courses.map((course) => (
          <button
            key={course.id}
            type="button"
            onClick={() => {
              setActiveCourseId(course.id);
              const first = course.modules
                .flatMap((m) => m.lessons)
                .sort((a, b) => a.position - b.position)[0];
              setActiveLessonId(first?.id ?? null);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              course.id === activeCourseId
                ? "border-primary bg-primary/10 font-semibold"
                : "border-border"
            }`}
          >
            {course.title}
          </button>
        ))}
      </div>

      {activeLesson ? (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{activeLesson.title}</h2>
          {embed ? (
            <div className="aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                title={activeLesson.title}
                src={embed}
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Video link was not saved for this lesson. Try opening it from My Courses when the site is healthy.
            </p>
          )}
        </div>
      ) : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Lessons on this device
        </h3>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {lessons.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => setActiveLessonId(lesson.id)}
                className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm ${
                  lesson.id === activeLesson?.id ? "bg-muted/60 font-medium" : ""
                }`}
              >
                <span>{lesson.title}</span>
                {!lesson.videoUrl ? (
                  <span className="text-xs text-muted-foreground">no video saved</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Continuity mode uses the last course copy saved on this browser. Prefer{" "}
        <Link href="/courses" className="underline">
          My Courses
        </Link>{" "}
        when the platform is fully online.
      </p>
    </div>
  );
}
