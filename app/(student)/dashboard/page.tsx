import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { requireStudent } from "@/lib/auth";
import { fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { getStudentEnrolledCoursesWithProgress } from "@/lib/student-enrollments";
import { getStudentCertificates } from "@/lib/student-certificates";
import { DashboardAnnouncements } from "@/components/student/dashboard-announcements";
import { CourseProgressNudge } from "@/components/student/course-progress-nudge";
import { RecommendationRail } from "@/components/marketplace/recommendation-rail";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { resumeLessonPath } from "@/lib/system-email-triggers";
import { recommendCourses } from "@/lib/recommendations";
import { DashboardCompanionWelcome } from "@/components/student/dashboard-companion-welcome";
import { toPercent } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function StudentDashboardPage() {
  const profile = await requireStudent();

  const myCourses = await getStudentEnrolledCoursesWithProgress(profile.id);
  const certificates = await getStudentCertificates(profile.id);
  const enrolledIds = new Set(myCourses.map((row) => row.courseId));

  const catalog = await fetchPublishedCourses<CatalogCourse>(
    "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, is_coming_soon, category:course_categories(name)",
  );

  const recommendable = catalog.map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));

  const continueCourse =
    myCourses
      .filter(({ pct, course }) => course && pct < 100)
      .sort((a, b) => b.pct - a.pct)[0] ?? null;

  const seedCourse =
    continueCourse?.course ??
    myCourses.find((row) => row.course && row.pct >= 100)?.course ??
    myCourses.find((row) => row.course)?.course ??
    null;

  const seedCategory =
    seedCourse != null
      ? (recommendable.find((c) => c.id === seedCourse.id)?.category_name ?? null)
      : null;

  const recommendations = recommendCourses({
    catalog: recommendable,
    ownedIds: enrolledIds,
    seed: seedCourse
      ? {
          id: seedCourse.id,
          title: seedCourse.title,
          category_name: seedCategory,
        }
      : null,
    preferContinue: Boolean(continueCourse?.course),
    limit: 3,
  });

  const continueResumePath = continueCourse?.course
    ? await resumeLessonPath(profile.id, continueCourse.course.id)
    : null;

  const activeCourses = myCourses.filter(({ course, pct }) => course && pct < 100);
  const completedCourses = myCourses.filter(({ course, pct }) => course && pct >= 100);

  const firstName = (profile.full_name ?? "there").split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl space-y-12">
      <DashboardCompanionWelcome />
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl">
          {firstName}, pick up where you left off
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Your courses, progress, and next lesson — in one place.
        </p>
      </header>

      <DashboardAnnouncements studentId={profile.id} />

      {continueCourse?.course ? (
        <section className="border-b border-neutral-200 pb-10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
            Continue learning
          </p>
          <div className="mt-4 flex gap-4 sm:gap-5">
            <div className="relative h-20 w-28 shrink-0 overflow-hidden bg-neutral-100 sm:h-28 sm:w-40">
              {continueCourse.course.thumbnail_url ? (
                <Image
                  src={continueCourse.course.thumbnail_url}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="160px"
                />
              ) : (
                <CourseThumbnailPlaceholder title={continueCourse.course.title} size="compact" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
                {continueCourse.course.title}
              </h2>
              <div className="mt-4">
                <CourseProgressNudge
                  pct={continueCourse.pct}
                  lessonsLeft={continueCourse.lessonsLeft}
                  totalLessons={continueCourse.totalLessons}
                />
              </div>
              <Link
                href={continueResumePath ?? `/courses/${continueCourse.course.id}`}
                className="mt-6 inline-flex h-11 min-h-[44px] items-center gap-2 bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Resume lesson
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-lg font-bold text-neutral-900">Active courses</h2>
          {myCourses.length > 0 ? (
            <Link href="/courses" className="text-sm font-medium text-neutral-600 hover:text-brand">
              View all
            </Link>
          ) : null}
        </div>

        {myCourses.length === 0 ? (
          <div className="border-y border-neutral-200 py-10">
            <p className="text-sm text-neutral-600">You haven&apos;t enrolled in a course yet.</p>
            <Link
              href="/browse"
              className="mt-3 inline-flex text-sm font-semibold text-brand hover:text-brand-700"
            >
              Browse the catalog
            </Link>
          </div>
        ) : activeCourses.length === 0 ? (
          <div className="border-y border-neutral-200 py-8">
            <p className="text-sm text-neutral-600">
              No active courses — you&apos;ve completed everything you&apos;re enrolled in.
            </p>
            <Link
              href="/browse"
              className="mt-3 inline-flex text-sm font-semibold text-brand hover:text-brand-700"
            >
              Find your next program
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {activeCourses.map(({ courseId, course, pct, lessonsLeft, totalLessons }) => {
              if (!course) return null;
              return (
                <li key={courseId}>
                  <Link
                    href={`/courses/${course.id}`}
                    className="flex h-full min-h-[44px] flex-col border border-neutral-200 bg-white transition hover:border-neutral-400"
                  >
                    <div className="relative aspect-[16/10] w-full bg-neutral-100">
                      {course.thumbnail_url ? (
                        <Image
                          src={course.thumbnail_url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 100vw, 50vw"
                        />
                      ) : (
                        <CourseThumbnailPlaceholder title={course.title} />
                      )}
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <p className="line-clamp-2 font-display text-[15px] font-semibold text-neutral-900">
                        {course.title}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {pct}% complete
                        {typeof lessonsLeft === "number" &&
                        typeof totalLessons === "number" &&
                        totalLessons > 0
                          ? ` · ${lessonsLeft} left`
                          : null}
                      </p>
                      <div className="mt-3 h-1 overflow-hidden bg-neutral-100">
                        <div
                          className="h-full bg-brand"
                          style={{ width: `${toPercent(pct)}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {completedCourses.length > 0 ? (
        <section>
          <h2 className="mb-4 font-display text-lg font-bold text-neutral-900">Completed</h2>
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {completedCourses.map(({ courseId, course }) => {
              if (!course) return null;
              return (
                <li key={courseId}>
                  <Link
                    href={`/courses/${course.id}`}
                    className="flex min-h-[56px] items-center justify-between gap-4 py-3.5"
                  >
                    <span className="truncate font-medium text-neutral-900">{course.title}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {certificates.length > 0 ? (
        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="font-display text-lg font-bold text-neutral-900">Certificates</h2>
            <Link
              href="/certificates"
              className="text-sm font-medium text-neutral-600 hover:text-brand"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-neutral-200 border-y border-neutral-200">
            {certificates.slice(0, 3).map((cert) => (
              <li key={cert.id}>
                <Link
                  href={`/certificates/${cert.id}`}
                  className="flex min-h-[56px] items-center justify-between gap-4 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-900">
                      {cert.courseTitle ?? "Course certificate"}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500">
                      {cert.recipientName}
                      {cert.certificateNumber ? ` · #${cert.certificateNumber}` : null}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <RecommendationRail
        title="Recommended next"
        subtitle={
          seedCategory
            ? "Programs related to what you’re studying."
            : "Programs from the catalog you don’t own yet."
        }
        items={recommendations}
      />
    </div>
  );
}
