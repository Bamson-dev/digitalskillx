import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { requireStudent } from "@/lib/auth";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";
import { getStudentViewSupabase } from "@/lib/student-view-supabase";
import { LessonOutline } from "@/components/student/lesson-outline";
import { LessonPlayer } from "@/components/student/lesson-player";
import { LessonComingSoonView } from "@/components/student/lesson-coming-soon-view";
import { isLessonComingSoon } from "@/lib/lesson-coming-soon";
import { LessonAttachments } from "@/components/student/lesson-attachments";
import { CourseResources } from "@/components/student/course-resources";
import { CourseProgressNudge } from "@/components/student/course-progress-nudge";
import { CourseCertificateGoal } from "@/components/student/course-certificate-goal";
import { resolveCertificateTemplateKey } from "@/lib/certificate-template-resolve";
import { Card } from "@/components/ui/card";
import type { Lesson, Module } from "@/types/database";

export const metadata: Metadata = { title: "Lesson" };

type ModuleWithLessons = Module & { lessons: Lesson[] };

export default async function LessonPage({ params }: { params: { id: string } }) {
  const profile = await requireStudent();
  const isAdminPreview = profile.role === "admin";
  const session = createClient();

  await bootstrapRuntimeSecrets();
  const lookup = await createAdminClientAsync(session);
  const { data: lessonMeta } = await lookup
    .from("lessons")
    .select("id, module_id, is_free_preview")
    .eq("id", params.id)
    .single();
  if (!lessonMeta) notFound();

  const { data: moduleRow } = await lookup
    .from("modules")
    .select("course_id")
    .eq("id", lessonMeta.module_id)
    .single();
  const courseId = moduleRow?.course_id;
  if (!courseId) notFound();

  const { data: courseAccess } = await lookup
    .from("courses")
    .select("is_coming_soon")
    .eq("id", courseId)
    .single();
  if (courseAccess?.is_coming_soon && !isAdminPreview) {
    redirect(`/courses/${courseId}`);
  }

  const { enrolled, targetStudentId } = await checkStudentCourseEnrollment(profile.id, courseId);
  if (!enrolled && !isAdminPreview && !lessonMeta.is_free_preview) {
    redirect(`/course/${courseId}`);
  }

  const supabase = await getStudentViewSupabase(profile, { courseId, enrolled });

  const { data: lesson } = await supabase.from("lessons").select("*").eq("id", params.id).single();
  if (!lesson) notFound();

  const studentId = enrolled ? targetStudentId : profile.id;

  const [{ data: course }, { data: modules }, { data: progress }, { data: note }, { data: bookmarks }, { data: enrollment }, { data: attachments }, { data: courseResources }, { data: certificate }] =
    await Promise.all([
      supabase.from("courses").select("id, title, certificate_enabled").eq("id", courseId).single(),
      supabase.from("modules").select("*, lessons(*)").eq("course_id", courseId),
      session.from("lesson_progress").select("lesson_id, completed").eq("student_id", studentId),
      session.from("student_notes").select("content").eq("student_id", studentId).eq("lesson_id", params.id).maybeSingle(),
      session.from("bookmarks").select("*").eq("student_id", studentId).eq("lesson_id", params.id).order("timestamp_seconds"),
      enrolled
        ? supabase
            .from("enrollments")
            .select("enrolled_at, completed_at")
            .eq("student_id", studentId)
            .eq("course_id", courseId)
            .maybeSingle()
        : session
            .from("enrollments")
            .select("enrolled_at, completed_at")
            .eq("student_id", studentId)
            .eq("course_id", courseId)
            .maybeSingle(),
      supabase
        .from("resources")
        .select("id, title, file_url, file_type")
        .eq("lesson_id", params.id)
        .eq("is_archived", false)
        .order("created_at", { ascending: true }),
      supabase
        .from("resources")
        .select("id, title, file_url, file_type")
        .eq("course_id", courseId)
        .is("lesson_id", null)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      enrolled
        ? supabase
            .from("certificates")
            .select("id")
            .eq("student_id", studentId)
            .eq("course_id", courseId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const sortedModules = [...((modules as ModuleWithLessons[]) ?? [])].sort((a, b) => a.position - b.position);
  const completedIds = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id));

  // Flatten lessons in order to evaluate locking + drip.
  const ordered: Lesson[] = sortedModules.flatMap((m) =>
    [...(m.lessons ?? [])].sort((a, b) => a.position - b.position),
  );
  const lockedIds = isAdminPreview
    ? new Set<string>()
    : computeLockedIds(ordered, completedIds, enrollment?.enrolled_at ?? null);

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("lesson_id", params.id)
    .maybeSingle();

  const isLocked = lockedIds.has(lesson.id);
  const isComingSoon = isLessonComingSoon(lesson);

  const totalLessons = ordered.length;
  const completedLessons = ordered.filter((item) => completedIds.has(item.id)).length;
  const lessonsLeft = totalLessons - completedLessons;
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const courseComplete = Boolean(enrollment?.completed_at) || (totalLessons > 0 && lessonsLeft === 0);
  const certificateTemplateKey =
    course?.certificate_enabled && enrolled
      ? await resolveCertificateTemplateKey(supabase, courseId)
      : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:gap-6">
      <aside className="order-2 lg:order-1 lg:sticky lg:top-20 lg:self-start">
        <LessonOutline
          courseId={courseId}
          courseTitle={course?.title ?? "Course"}
          modules={sortedModules}
          currentLessonId={lesson.id}
          completedIds={completedIds}
          lockedIds={lockedIds}
        />
      </aside>

      <div className="order-1 lg:order-2">
        {isComingSoon ? (
          <LessonComingSoonView
            lessonTitle={lesson.title}
            courseTitle={course?.title ?? "Course"}
            courseId={courseId}
            description={lesson.description}
            availableAt={lesson.coming_soon_available_at}
          />
        ) : isLocked ? (
          <Card className="flex flex-col items-center gap-3 py-16 text-center">
            <Lock className="h-8 w-8 text-muted" />
            <h2 className="text-lg font-semibold">This lesson is locked</h2>
            <p className="max-w-sm text-sm text-muted">
              Complete the previous lesson or wait for it to unlock on its scheduled drip date.
            </p>
          </Card>
        ) : (
          <div className="space-y-5">
            {enrolled ? (
              <Card className="p-4 sm:p-5">
                <CourseProgressNudge
                  pct={progressPct}
                  lessonsLeft={lessonsLeft}
                  totalLessons={totalLessons}
                />
              </Card>
            ) : null}
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
            {course?.certificate_enabled && enrolled ? (
              <CourseCertificateGoal
                unlocked={courseComplete || Boolean(certificate)}
                certificateId={certificate?.id}
                templateKey={certificateTemplateKey}
              />
            ) : null}
          </div>
        )}

        <div className="mt-5">
          <CourseResources resources={courseResources ?? []} />
        </div>
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
    if (l.is_free_preview || l.is_coming_soon) continue;

    // Sequential lock: previous required lesson must be completed (skip coming-soon placeholders).
    if (l.is_locked && i > 0) {
      let prevIdx = i - 1;
      while (prevIdx >= 0 && ordered[prevIdx].is_coming_soon) prevIdx--;
      if (prevIdx >= 0) {
        const prev = ordered[prevIdx];
        if (!completedIds.has(prev.id)) locked.add(l.id);
      }
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
