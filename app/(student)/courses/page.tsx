import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentEnrolledCourses } from "@/lib/student-enrollments";

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
        <div className="border-y border-neutral-200 py-10">
          <p className="text-sm text-neutral-600">No courses yet.</p>
          <Link
            href="/browse"
            className="mt-3 inline-flex text-sm font-semibold text-brand hover:text-brand-700"
          >
            Browse the catalog
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
          {enrolled.map((row) => {
            const course = row.course;
            if (!course) {
              return (
                <li key={row.enrollmentId}>
                  <Link
                    href={`/courses/${row.courseId}`}
                    className="flex min-h-[56px] items-center justify-between gap-4 py-4"
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
                  className="flex min-h-[64px] items-center gap-4 py-4"
                >
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden bg-neutral-100 sm:h-14 sm:w-20">
                    {course.thumbnail_url ? (
                      <Image
                        src={course.thumbnail_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : null}
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
