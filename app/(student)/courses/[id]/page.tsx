import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentViewSupabase } from "@/lib/student-view-supabase";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";
import { CourseComingSoonView } from "@/components/course/course-coming-soon-view";
import { CourseCommunitySection } from "@/components/course/course-community-section";
import { courseCommunityFromRow } from "@/lib/course-community";
import { CourseResources } from "@/components/student/course-resources";
import { CourseCurriculumList } from "@/components/student/course-curriculum-list";
import type { Lesson, Module } from "@/types/database";

export const metadata: Metadata = { title: "Course" };

export default async function CourseDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const profile = await requireStudent();
  const isAdminPreview = profile.role === "admin";

  const { enrolled, enrollmentId } = await checkStudentCourseEnrollment(profile.id, params.id);
  const enrollment = enrolled ? { id: enrollmentId! } : null;

  if (!enrolled && !isAdminPreview) {
    redirect(`/course/${params.id}`);
  }

  const supabase = await getStudentViewSupabase(profile, {
    courseId: params.id,
    enrolled,
  });

  const { data: course } = await supabase
    .from("courses")
    .select(
      "id, title, description, short_description, thumbnail_url, promo_video_url, learning_outcomes, instructor_name, is_coming_soon, community_telegram_url, community_whatsapp_url, modules(id, title, position, lessons(id, title, position, duration_seconds))",
    )
    .eq("id", params.id)
    .single();

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

  const { data: resources } = await supabase
    .from("resources")
    .select("id, title, file_url, file_type")
    .eq("course_id", params.id)
    .is("lesson_id", null)
    .eq("is_archived", false)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  const modules = [...(course.modules ?? [])].sort((a, b) => a.position - b.position) as (Module & {
    lessons: Lesson[];
  })[];

  return (
    <div className="space-y-6">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </Link>

      <div>
        <h1 className="text-2xl font-bold">{course.title}</h1>
        {isAdminPreview && !enrollment ? (
          <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Admin preview — you are viewing this course as a student would, without enrolling.
          </p>
        ) : null}
        {course.description ? (
          <p className="mt-1 text-sm text-muted">{course.description}</p>
        ) : null}
      </div>

      <CourseCommunitySection links={communityLinks} courseTitle={course.title} />

      {modules.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-white p-8 text-center text-sm text-muted">
          This course doesn&apos;t have any content yet.
        </div>
      ) : (
        <CourseCurriculumList modules={modules} />
      )}

      <CourseResources resources={resources ?? []} />
    </div>
  );
}
