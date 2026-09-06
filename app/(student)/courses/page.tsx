import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentEnrolledCourses } from "@/lib/student-enrollments";
import { CourseMediaImage } from "@/components/marketplace/course-media-image";

export const metadata: Metadata = { title: "My Courses" };

export default async function StudentCoursesPage() {
  const profile = await requireStudent();
  const enrolled = await getStudentEnrolledCourses(profile.id);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900">
          My courses
        </h1>
        <p className="mt-1 text-sm text-neutral-500">Open a course to resume learning.</p>
      </div>

      {enrolled.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center">
          <p className="font-display text-lg font-semibold text-neutral-900">
            Your learning starts here
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            Browse available courses and start learning.
          </p>
          <Link
            href="/browse"
            className="mt-5 inline-flex h-11 min-h-[44px] items-center justify-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {enrolled.map((row) => {
            const course = row.course;
            if (!course) {
              return (
                <li key={row.enrollmentId}>
                  <Link
                    href={`/courses/${row.courseId}`}
                    className="flex min-h-[56px] items-center justify-between gap-4 px-4 py-4 hover:bg-neutral-50"
                  >
                    <span className="font-medium text-neutral-900">Open enrolled course</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
                  </Link>
                </li>
              );
            }
            return (
              <li key={row.enrollmentId}>
                <Link
                  href={`/courses/${course.id}`}
                  className="flex min-h-[64px] items-center gap-4 px-4 py-4 hover:bg-neutral-50"
                >
                  <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-neutral-100">
                    <CourseMediaImage
                      src={course.thumbnail_url}
                      alt={course.title}
                      title={course.title}
                      aspect="none"
                      sizes="96px"
                      placeholderSize="compact"
                      className="absolute inset-0 h-full w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">{course.title}</p>
                    {course.is_coming_soon ? (
                      <p className="mt-0.5 text-xs text-neutral-500">Coming soon</p>
                    ) : course.short_description || course.description ? (
                      <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">
                        {course.short_description ?? course.description}
                      </p>
                    ) : null}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
