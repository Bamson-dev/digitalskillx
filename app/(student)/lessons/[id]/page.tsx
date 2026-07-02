import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { LessonOutline } from "@/components/student/lesson-outline";
import { LessonPlayer } from "@/components/student/lesson-player";
import { LessonAttachments } from "@/components/student/lesson-attachments";
import { Card } from "@/components/ui/card";
import type { Lesson, Module } from "@/types/database";

export const metadata: Metadata = { title: "Lesson" };

type ModuleWithLessons = Module & { lessons: Lesson[] };

export default async function LessonPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const supabase = createClient();

  // RLS gates this read to enrolled students / free previews.
  const { data: lesson } = await supabase.from("lessons").select("*").eq("id", params.id).single();
  if (!lesson) notFound();

  const { data: moduleRow } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", lesson.module_id)
    .single();
  const courseId = moduleRow?.course_id;
  if (!courseId) notFound();

  const [{ data: course }, { data: modules }, { data: progress }, { data: note }, { data: bookmarks }, { data: enrollment }, { data: attachments }] =
    await Promise.all([
      supabase.from("courses").select("id, title").eq("id", courseId).single(),
      supabase.from("modules").select("*, lessons(*)").eq("course_id", courseId),
      supabase.from("lesson_progress").select("lesson_id, completed").eq("student_id", profile.id),
      supabase.from("student_notes").select("content").eq("student_id", profile.id).eq("lesson_id", params.id).maybeSingle(),
      supabase.from("bookmarks").select("*").eq("student_id", profile.id).eq("lesson_id", params.id).order("timestamp_seconds"),
      supabase.from("enrollments").select("enrolled_at").eq("student_id", profile.id).eq("course_id", courseId).maybeSingle(),
      supabase
        .from("resources")
        .select("id, title, file_url, file_type")
        .eq("lesson_id", params.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
    ]);

  const sortedModules = [...((modules as ModuleWithLessons[]) ?? [])].sort((a, b) => a.position - b.position);
  const completedIds = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id));

  // Flatten lessons in order to evaluate locking + drip.
  const ordered: Lesson[] = sortedModules.flatMap((m) =>
    [...(m.lessons ?? [])].sort((a, b) => a.position - b.position),
  );
  const lockedIds = computeLockedIds(ordered, completedIds, enrollment?.enrolled_at ?? null);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("lesson_id", params.id)
    .maybeSingle();

  const isLocked = lockedIds.has(lesson.id);

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <LessonOutline
          courseId={courseId}
          courseTitle={course?.title ?? "Course"}
          modules={sortedModules}
          currentLessonId={lesson.id}
          completedIds={completedIds}
          lockedIds={lockedIds}
        />
      </aside>

      <div>
        {isLocked ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Lock className="h-8 w-8 text-muted" />
            <h2 className="text-lg font-semibold">This lesson is locked</h2>
            <p className="max-w-sm text-sm text-muted">
              Complete the previous lesson or wait for it to unlock on its scheduled drip date.
            </p>
          </Card>
        ) : (
          <div className="space-y-5">
            <LessonPlayer
              lesson={lesson}
              studentEmail={profile.email}
              completed={completedIds.has(lesson.id)}
              note={note?.content ?? ""}
              bookmarks={bookmarks ?? []}
            />
            <LessonAttachments attachments={attachments ?? []} />
            {quiz ? (
              <Card className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{quiz.title}</h3>
                  <p className="text-sm text-muted">Test your understanding of this lesson.</p>
                </div>
                <Link
                  href={`/quizzes/${quiz.id}`}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Take quiz
                </Link>
              </Card>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function computeLockedIds(
  ordered: Lesson[],
  completedIds: Set<string>,
  enrolledAt: string | null,
): Set<string> {
  const locked = new Set<string>();
  for (let i = 0; i < ordered.length; i++) {
    const l = ordered[i];
    if (l.is_free_preview) continue;

    // Sequential lock: previous lesson must be completed.
    if (l.is_locked && i > 0) {
      const prev = ordered[i - 1];
      if (!completedIds.has(prev.id)) locked.add(l.id);
    }

    // Drip lock: not yet available X days after enrollment.
    if (l.drip_days && enrolledAt) {
      const unlockAt = new Date(enrolledAt).getTime() + l.drip_days * 86400000;
      if (Date.now() < unlockAt) locked.add(l.id);
    }
    if (l.drip_date && Date.now() < new Date(l.drip_date).getTime()) locked.add(l.id);
  }
  return locked;
}
