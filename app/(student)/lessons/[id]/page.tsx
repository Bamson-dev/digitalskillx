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
import { LessonLearningLayout } from "@/components/student/lesson-learning-layout";
import { LessonPlayer } from "@/components/student/lesson-player";
import { LessonComingSoonView } from "@/components/student/lesson-coming-soon-view";
import { isLessonComingSoon } from "@/lib/lesson-coming-soon";
import { LessonAttachments } from "@/components/student/lesson-attachments";
import { CourseResources } from "@/components/student/course-resources";
import { CourseCertificateGoal } from "@/components/student/course-certificate-goal";
import {
  NextBestAction,
  resolveNextBestAction,
} from "@/components/student/next-best-action";
import { LessonProgressChecklist } from "@/components/student/lesson-progress-checklist";
import { ClassroomEngagementRoot } from "@/components/student/classroom-engagement-root";
import { resolveEngagementFlags } from "@/lib/classroom-engagement";
import { resolveCertificateTemplateKey } from "@/lib/certificate-template-resolve";
import { isMissingColumnError } from "@/lib/schema-guard";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { getCourseRecommendationsForDisplay } from "@/lib/course-recommendations";
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

  const courseAccessQuery = await lookup
    .from("courses")
    .select("is_coming_soon")
    .eq("id", courseId)
    .single();
  let courseIsComingSoon = Boolean(courseAccessQuery.data?.is_coming_soon);
  if (courseAccessQuery.error) {
    if (isMissingColumnError(courseAccessQuery.error.message)) {
      console.error(
        "[LessonPage] courses.is_coming_soon missing — run sql/apply-production-stability.sql",
        courseAccessQuery.error.message,
      );
      courseIsComingSoon = false;
    } else {
      console.error("[LessonPage] course access query failed", courseAccessQuery.error.message);
    }
  }
  if (courseIsComingSoon && !isAdminPreview) {
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

  const [
    courseResult,
    { data: modules },
    { data: progress },
    { data: note },
    { data: bookmarks },
    { data: enrollment },
    { data: attachments },
    { data: courseResources },
    { data: certificate },
  ] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, certificate_enabled, companion_enabled, celebrations_enabled")
      .eq("id", courseId)
      .single(),
    supabase.from("modules").select("*, lessons(*)").eq("course_id", courseId),
    session.from("lesson_progress").select("lesson_id, completed").eq("student_id", studentId),
    session
      .from("student_notes")
      .select("content")
      .eq("student_id", studentId)
      .eq("lesson_id", params.id)
      .maybeSingle(),
    session
      .from("bookmarks")
      .select("*")
      .eq("student_id", studentId)
      .eq("lesson_id", params.id)
      .order("timestamp_seconds"),
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

  let course = courseResult.data as {
    id: string;
    title: string;
    certificate_enabled: boolean | null;
    companion_enabled?: boolean | null;
    celebrations_enabled?: boolean | null;
  } | null;
  if (courseResult.error && isMissingColumnError(courseResult.error.message)) {
    const fallback = await supabase
      .from("courses")
      .select("id, title, certificate_enabled")
      .eq("id", courseId)
      .single();
    course = fallback.data
      ? { ...fallback.data, companion_enabled: true, celebrations_enabled: true }
      : null;
  }

  const sortedModules = [...((modules as ModuleWithLessons[]) ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const completedIds = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id));

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

  let quizPassed = false;
  if (quiz) {
    const { data: passedAttempt } = await session
      .from("quiz_attempts")
      .select("id")
      .eq("student_id", studentId)
      .eq("quiz_id", quiz.id)
      .eq("passed", true)
      .limit(1)
      .maybeSingle();
    quizPassed = Boolean(passedAttempt);
  }

  const isLocked = lockedIds.has(lesson.id);
  const isComingSoon = isLessonComingSoon(lesson);
  const lessonCompleted = completedIds.has(lesson.id);

  const totalLessons = ordered.length;
  const lessonIndex = Math.max(1, ordered.findIndex((item) => item.id === lesson.id) + 1);
  const currentPos = ordered.findIndex((item) => item.id === lesson.id);
  const prevLessonId = currentPos > 0 ? ordered[currentPos - 1]?.id ?? null : null;
  const nextLessonId =
    currentPos >= 0 && currentPos < ordered.length - 1 ? ordered[currentPos + 1]?.id ?? null : null;

  const completedLessons = ordered.filter((item) => completedIds.has(item.id)).length;
  const lessonsLeft = totalLessons - completedLessons;
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
  const courseComplete = Boolean(enrollment?.completed_at) || (totalLessons > 0 && lessonsLeft === 0);
  const certificateTemplateKey =
    course?.certificate_enabled && enrolled
      ? await resolveCertificateTemplateKey(supabase, courseId)
      : null;

  let nextStepHref: string | null = null;
  let nextStepTitle: string | null = null;
  if (enrolled && (courseComplete || certificate) && courseId) {
    try {
      const admin = await createAdminClientAsync(session);
      const catalog = await fetchPublishedCourses<CatalogCourse>(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
      );
      const recommendable = catalog.map((c) => ({
        ...c,
        category_name: c.category?.name ?? null,
      }));
      const { data: ownedRows } = await admin
        .from("enrollments")
        .select("course_id")
        .eq("student_id", studentId);
      const ownedIds = new Set((ownedRows ?? []).map((r) => r.course_id));
      const recs = await getCourseRecommendationsForDisplay(admin, {
        courseId,
        catalog: recommendable,
        ownedIds,
        kind: ["next_step", "upsell", "cross_sell", "related"],
        limit: 1,
      });
      const first = recs[0];
      if (first?.course?.id) {
        nextStepHref = `/course/${first.course.id}`;
        nextStepTitle = first.course.title;
      }
    } catch (err) {
      console.error("[LessonPage] next-step recommendation failed", err);
    }
  }

  const nextAction = resolveNextBestAction({
    lessonCompleted,
    quizId: quiz?.id,
    quizPassed: quiz ? quizPassed : null,
    nextLessonId,
    courseId,
    certificateId: certificate?.id,
    courseComplete,
  });

  const engagement = resolveEngagementFlags(course ?? undefined);

  return (
    <LessonLearningLayout
      courseId={courseId}
      courseTitle={course?.title ?? "Course"}
      modules={sortedModules}
      currentLessonId={lesson.id}
      completedIds={[...completedIds]}
      lockedIds={[...lockedIds]}
      progressPct={progressPct}
      lessonIndex={lessonIndex}
      totalLessons={totalLessons}
    >
      <ClassroomEngagementRoot
        companionEnabled={engagement.companionEnabled}
        celebrationsEnabled={engagement.celebrationsEnabled}
      />
      {isComingSoon ? (
        <div className="px-4 py-6 sm:px-0">
          <LessonComingSoonView
            lessonTitle={lesson.title}
            courseTitle={course?.title ?? "Course"}
            courseId={courseId}
            description={lesson.description}
            availableAt={lesson.coming_soon_available_at}
          />
        </div>
      ) : isLocked ? (
        <div className="mx-4 my-10 flex flex-col items-center gap-3 border border-neutral-200 px-6 py-16 text-center sm:mx-0">
          <Lock className="h-8 w-8 text-neutral-400" />
          <h2 className="font-display text-lg font-bold text-neutral-900">This lesson is locked</h2>
          <p className="max-w-sm text-sm text-neutral-500">
            Complete the previous lesson or wait for it to unlock on its scheduled drip date.
          </p>
          {prevLessonId ? (
            <Link
              href={`/lessons/${prevLessonId}`}
              className="mt-2 inline-flex h-11 items-center bg-brand px-5 text-sm font-semibold text-white"
            >
              Go to previous lesson
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6 pb-2">
          <LessonPlayer
            lesson={lesson}
            studentEmail={profile.email}
            completed={lessonCompleted}
            note={note?.content ?? ""}
            bookmarks={bookmarks ?? []}
            lessonIndex={lessonIndex}
            totalLessons={totalLessons}
            prevLessonId={prevLessonId}
            nextLessonId={nextLessonId}
          />

          <LessonAttachments attachments={attachments ?? []} />

          {quiz ? (
            <LessonProgressChecklist
              lessonCompleted={lessonCompleted}
              quiz={{ id: quiz.id, title: quiz.title, passed: quizPassed }}
            />
          ) : null}

          {nextAction ? (
            <NextBestAction
              kind={nextAction.kind}
              href={nextAction.href}
              label={nextAction.label}
              detail={nextAction.detail}
            />
          ) : quiz ? (
            <div className="flex flex-col gap-3 border-y border-neutral-200 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-0">
              <div>
                <h3 className="font-display text-sm font-bold text-neutral-900">{quiz.title}</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  {quizPassed
                    ? "You already passed this quiz. Retake anytime if you want more practice."
                    : "Optional until you mark the lesson complete — then it becomes your next step."}
                </p>
              </div>
              <Link
                href={`/quizzes/${quiz.id}`}
                className="inline-flex h-11 items-center justify-center border border-neutral-200 px-5 text-sm font-semibold text-neutral-800 hover:border-neutral-400"
              >
                {quizPassed ? "Review quiz" : "Take quiz"}
              </Link>
            </div>
          ) : null}

          {course?.certificate_enabled && enrolled ? (
            <CourseCertificateGoal
              unlocked={courseComplete || Boolean(certificate)}
              certificateId={certificate?.id}
              templateKey={certificateTemplateKey}
              courseId={courseId}
              nextStepHref={nextStepHref}
              nextStepTitle={nextStepTitle}
            />
          ) : null}

          <div className="pb-2">
            <CourseResources resources={courseResources ?? []} />
          </div>
        </div>
      )}
    </LessonLearningLayout>
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

    if (l.is_locked && i > 0) {
      let prevIdx = i - 1;
      while (prevIdx >= 0 && ordered[prevIdx].is_coming_soon) prevIdx--;
      if (prevIdx >= 0) {
        const prev = ordered[prevIdx];
        if (!completedIds.has(prev.id)) locked.add(l.id);
      }
    }

    if (l.drip_days && enrolledAt) {
      const unlockAt = new Date(enrolledAt).getTime() + l.drip_days * 86400000;
      if (Date.now() < unlockAt) locked.add(l.id);
    }
    if (l.drip_date && Date.now() < new Date(l.drip_date).getTime()) locked.add(l.id);
  }
  return locked;
}
