import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { getStudentViewSupabase } from "@/lib/student-view-supabase";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";
import { CourseComingSoonView } from "@/components/course/course-coming-soon-view";
import { CourseCommunitySection } from "@/components/course/course-community-section";
import { courseCommunityFromRow } from "@/lib/course-community";
import { CourseResources } from "@/components/student/course-resources";
import { CourseCurriculumList } from "@/components/student/course-curriculum-list";
import { isLessonComingSoon } from "@/lib/lesson-coming-soon";
import { isMissingColumnError } from "@/lib/schema-guard";
import type { Lesson, Module } from "@/types/database";

export const metadata: Metadata = { title: "Course" };

const FULL_COURSE_SELECT =
  "id, title, description, short_description, thumbnail_url, promo_video_url, learning_outcomes, instructor_name, is_coming_soon, community_telegram_url, community_whatsapp_url, modules(id, title, position, lessons(id, title, position, duration_seconds, is_locked, drip_days, drip_date, is_free_preview, is_coming_soon, coming_soon_available_at))";

const FALLBACK_COURSE_SELECT =
  "id, title, description, short_description, thumbnail_url, promo_video_url, learning_outcomes, instructor_name, modules(id, title, position, lessons(id, title, position, duration_seconds, is_locked, drip_days, drip_date, is_free_preview))";

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireStudent();
  const isAdminPreview = profile.role === "admin";
  const session = createClient();

  const { enrolled, enrollmentId, targetStudentId } = await checkStudentCourseEnrollment(
    profile.id,
    params.id,
  );
  const enrollment = enrolled ? { id: enrollmentId! } : null;
  const studentId = enrolled ? targetStudentId : profile.id;

  if (!enrolled && !isAdminPreview) {
    redirect(`/course/${params.id}`);
  }

  const supabase = await getStudentViewSupabase(profile, {
    courseId: params.id,
    enrolled,
  });

  let { data: course, error: courseError } = await supabase
    .from("courses")
    .select(FULL_COURSE_SELECT)
    .eq("id", params.id)
    .single();

  if (courseError && isMissingColumnError(courseError.message)) {
    console.error("[CourseDetailPage] schema drift; falling back select", courseError.message);
    const fallback = await supabase
      .from("courses")
      .select(FALLBACK_COURSE_SELECT)
      .eq("id", params.id)
      .single();
    course = fallback.data
      ? ({
          ...fallback.data,
          is_coming_soon: false,
          community_telegram_url: null,
          community_whatsapp_url: null,
        } as typeof course)
      : null;
    courseError = fallback.error;
  }

  if (courseError) {
    console.error("[CourseDetailPage] course query failed", courseError.message);
    throw new Error("Could not load this course. Please try again.");
  }

  if (!course) notFound();

  const communityLinks = courseCommunityFromRow(course);

  if (course.is_coming_soon && !isAdminPreview) {
    return (
      <div className="space-y-6">
        <CourseComingSoonView
          variant="student"
          title={course.title}
          description={course.description}
          shortDescription={course.short_description}
          thumbnailUrl={course.thumbnail_url}
          promoVideoUrl={course.promo_video_url}
          learningOutcomes={course.learning_outcomes ?? []}
          instructorName={course.instructor_name}
          communityLinks={communityLinks}
          backHref="/courses"
          backLabel="Back to courses"
        />
      </div>
    );
  }

  const [{ data: resources }, { data: progress }, { data: enrollmentRow }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("resources")
        .select("id, title, file_url, file_type")
        .eq("course_id", params.id)
        .is("lesson_id", null)
        .eq("is_archived", false)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
      session
        .from("lesson_progress")
        .select("lesson_id, completed")
        .eq("student_id", studentId),
      enrolled
        ? supabase
            .from("enrollments")
            .select("enrolled_at")
            .eq("student_id", studentId)
            .eq("course_id", params.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("assignments")
        .select("id, title, due_date, module_id")
        .eq("course_id", params.id)
        .eq("status", "published")
        .order("due_date", { ascending: true }),
    ]);

  const modules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position) as (Module & {
    lessons: Lesson[];
  })[];

  const ordered: Lesson[] = modules.flatMap((m) =>
    [...(m.lessons ?? [])].sort((a, b) => a.position - b.position),
  );
  const completedIds = new Set((progress ?? []).filter((p) => p.completed).map((p) => p.lesson_id));
  const lockedIds = isAdminPreview
    ? new Set<string>()
    : computeLockedIds(ordered, completedIds, enrollmentRow?.enrolled_at ?? null);

  const totalLessons = ordered.filter((l) => !isLessonComingSoon(l)).length;
  const completedLessons = ordered.filter(
    (l) => !isLessonComingSoon(l) && completedIds.has(l.id),
  ).length;
  const progressPct = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const resumeLessonId =
    ordered.find(
      (l) => !isLessonComingSoon(l) && !lockedIds.has(l.id) && !completedIds.has(l.id),
    )?.id ??
    ordered.find((l) => !isLessonComingSoon(l) && !lockedIds.has(l.id))?.id ??
    null;

  const outcomes = (course.learning_outcomes ?? []).filter((o) => o.trim().length > 0);

  return (
    <div className="space-y-8">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold text-neutral-950">{course.title}</h1>
        {isAdminPreview && !enrollment ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Admin preview — you are viewing this course as a student would, without enrolling.
          </p>
        ) : null}
        {course.description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-600">
            {course.description}
          </p>
        ) : null}
        {course.instructor_name ? (
          <p className="mt-2 text-sm text-neutral-500">Instructor · {course.instructor_name}</p>
        ) : null}
      </div>

      {outcomes.length > 0 ? (
        <section>
          <h2 className="font-display text-lg font-bold text-neutral-950">What you&apos;ll learn</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-neutral-700">
            {outcomes.map((outcome) => (
              <li key={outcome}>{outcome}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <CourseCommunitySection links={communityLinks} courseTitle={course.title} />

      {modules.length === 0 ? (
        <div className="border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          This course doesn&apos;t have any content yet.
        </div>
      ) : (
        <CourseCurriculumList
          modules={modules}
          completedIds={[...completedIds]}
          lockedIds={[...lockedIds]}
          progressPct={progressPct}
          resumeLessonId={resumeLessonId}
        />
      )}

      {(assignments ?? []).length > 0 ? (
        <section>
          <h2 className="font-display text-lg font-bold text-neutral-950">Assignments</h2>
          <p className="mt-1 text-sm text-neutral-500">
            Apply what you learned. Submit when you&apos;re ready.
          </p>
          <ul className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200">
            {(assignments ?? []).map((assignment) => (
              <li key={assignment.id}>
                <Link
                  href={`/assignments/${assignment.id}`}
                  className="flex min-h-[52px] items-center gap-3 py-3 hover:bg-neutral-50"
                >
                  <ClipboardList className="h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 font-medium text-neutral-900">
                    {assignment.title}
                  </span>
                  {assignment.due_date ? (
                    <span className="shrink-0 text-[11px] tabular-nums text-neutral-500">
                      Due{" "}
                      {new Intl.DateTimeFormat("en-NG", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }).format(new Date(assignment.due_date))}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <CourseResources resources={resources ?? []} />
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
