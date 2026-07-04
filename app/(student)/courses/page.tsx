import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { BookOpen } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { getStudentEnrolledCourses } from "@/lib/student-enrollments";

export const metadata: Metadata = { title: "My Courses" };

export default async function StudentCoursesPage() {
  const profile = await requireStudent();
  const enrolled = await getStudentEnrolledCourses(profile.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-neutral-900">My Courses</h1>
        <p className="mt-1 text-sm text-neutral-500">Everything you&apos;re enrolled in.</p>
      </div>

      {enrolled.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-border bg-white py-14 text-center text-sm text-neutral-500">
          <p>No courses yet.</p>
          <Link href="/" className="mt-4 inline-block font-semibold text-brand hover:text-brand-700">
            Browse the store →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {enrolled.map((row) => {
            const course = row.course;
            if (!course) {
              return (
                <Link key={row.enrollmentId} href={`/courses/${row.courseId}`}>
                  <article className="overflow-hidden rounded-xl border border-surface-border bg-white p-4 transition hover:shadow-card">
                    <h3 className="font-semibold text-neutral-900">Your enrolled course</h3>
                    <p className="mt-1 text-sm text-neutral-500">Tap to open.</p>
                  </article>
                </Link>
              );
            }
            return (
              <Link key={row.enrollmentId} href={`/courses/${course.id}`}>
                <article className="overflow-hidden rounded-xl border border-surface-border bg-white transition hover:shadow-card">
                  <div className="relative aspect-[16/10] bg-neutral-100">
                    {course.thumbnail_url ? (
                      <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="320px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand/40">
                        <BookOpen className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-neutral-900">{course.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                      {course.description ?? "No description yet."}
                    </p>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
