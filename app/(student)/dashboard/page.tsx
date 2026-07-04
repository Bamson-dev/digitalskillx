import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireStudent } from "@/lib/auth";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { courseCompletionPct } from "@/lib/progress";
import { toPercent } from "@/lib/utils";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { EnrollLink } from "@/components/marketplace/enroll-button";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StudentDashboardPage() {
  const profile = await requireStudent();
  const supabase = createClient();

  const { data: enrollments } = await supabase
    .from("enrollments")
    .select(
      "id, course_id, course:courses(id, title, description, short_description, thumbnail_url, price_ngn, price_usd)",
    )
    .eq("student_id", profile.id)
    .order("enrolled_at", { ascending: false });

  const enrolledIds = new Set((enrollments ?? []).map((e) => e.course_id));

  const catalog = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name",
  );

  const upsell = catalog.filter((c) => !enrolledIds.has(c.id));

  const myCourses = await Promise.all(
    (enrollments ?? []).map(async (e) => {
      const course = Array.isArray(e.course) ? e.course[0] : e.course;
      const pct = course ? await courseCompletionPct(profile.id, course.id) : 0;
      return { enrollment: e, course, pct };
    }),
  );

  const continueCourse =
    myCourses
      .filter(({ pct }) => pct < 100)
      .sort((a, b) => b.pct - a.pct)[0] ?? myCourses[0];

  const firstName = (profile.full_name ?? "there").split(" ")[0];

  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-neutral-900 sm:text-3xl">
          Hello, {firstName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500 sm:text-base">
          Welcome back. Ready to pick up where you left off?
        </p>
      </div>

      {/* Continue learning — featured */}
      {continueCourse?.course ? (
        <section>
          <h2 className="mb-4 font-display text-lg font-bold text-neutral-900">Continue learning</h2>
          <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
            <div className="grid sm:grid-cols-[140px_1fr] md:grid-cols-[200px_1fr]">
              <div className="relative hidden min-h-[120px] bg-neutral-100 sm:block">
                {continueCourse.course.thumbnail_url ? (
                  <Image
                    src={continueCourse.course.thumbnail_url}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="200px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-brand/40">
                    <BookOpen className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  In progress
                </p>
                <h3 className="mt-1 font-display text-lg font-bold text-neutral-900 sm:text-xl">
                  {continueCourse.course.title}
                </h3>
                <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
                  {continueCourse.course.short_description ?? continueCourse.course.description}
                </p>
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs text-neutral-500">
                    <span>{continueCourse.pct}% completed</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{ width: `${toPercent(continueCourse.pct)}%` }}
                    />
                  </div>
                </div>
                <Link
                  href={`/courses/${continueCourse.course.id}`}
                  className="mt-5 inline-flex h-12 min-h-[48px] items-center justify-center gap-2 rounded-lg bg-brand px-6 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Resume course <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* My active courses */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-neutral-900">My active courses</h2>
          <Link href="/courses" className="text-sm font-semibold text-brand hover:text-brand-700">
            View all →
          </Link>
        </div>

        {myCourses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-border bg-white py-14 text-center">
            <p className="text-neutral-500">You haven&apos;t purchased a course yet.</p>
            <Link
              href="/#courses"
              className="mt-4 inline-block text-sm font-semibold text-brand hover:text-brand-700"
            >
              Browse the catalog →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {myCourses.map(({ course, pct }) => {
              if (!course) return null;
              return (
                <Link
                  key={course.id}
                  href={`/courses/${course.id}`}
                  className="overflow-hidden rounded-xl border border-surface-border bg-white transition hover:border-neutral-300 hover:shadow-card"
                >
                  <div className="relative aspect-[16/9] bg-neutral-100">
                    {course.thumbnail_url ? (
                      <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="320px" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand/30">
                        <BookOpen className="h-10 w-10" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-2 font-semibold text-neutral-900">{course.title}</h3>
                    <div className="mt-3">
                      <div className="mb-1 flex justify-between text-xs text-neutral-500">
                        <span>Progress</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full bg-brand"
                          style={{ width: `${toPercent(pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recommended upsell */}
      {upsell.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-lg font-bold text-neutral-900">Recommended for you</h2>
          <div className="space-y-3">
            {upsell.slice(0, 4).map((course) => (
              <div
                key={course.id}
                className="flex flex-col gap-4 rounded-xl border border-surface-border bg-white p-4 sm:flex-row sm:items-center"
              >
                <div className="relative h-20 w-full shrink-0 overflow-hidden rounded-lg bg-neutral-100 sm:h-16 sm:w-16">
                  {course.thumbnail_url ? (
                    <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="64px" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-brand/40">
                      <BookOpen className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-neutral-900">{course.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                    {course.short_description ?? course.description}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <p className="text-lg font-bold text-neutral-900">
                    <PriceDisplay course={course} />
                  </p>
                  <EnrollLink courseId={course.id} />
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
