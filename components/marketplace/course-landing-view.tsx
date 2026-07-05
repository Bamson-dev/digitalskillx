"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { ORG } from "@/lib/org";
import { useCurrency } from "@/components/providers/currency-provider";
import { EnrollButton } from "@/components/marketplace/enroll-button";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { CurriculumAccordion } from "@/components/marketplace/curriculum-accordion";
import { CourseHeroMedia } from "@/components/marketplace/course-hero-media";
import { CourseCard, type MarketplaceCourse } from "@/components/marketplace/course-card";
import { cn } from "@/lib/utils";

type Lesson = { id: string; title: string; position: number; lesson_type: string };
type Module = { id: string; title: string; position: number; lessons: Lesson[] };

type CourseData = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  learning_outcomes: string[];
  instructor_name: string | null;
  instructor_bio: string | null;
  promo_video_url: string | null;
  modules: Module[];
  category_name?: string | null;
  rating?: number | null;
};

const TABS = ["About", "Curriculum", "Instructor", "Reviews"] as const;

function instructorInitials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function CourseLandingView({
  course,
  isEnrolled,
  isLoggedIn,
  related,
  lessonCount,
  enrollmentCount,
  purchaseComplete = false,
}: {
  course: CourseData;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  related: MarketplaceCourse[];
  lessonCount: number;
  enrollmentCount?: number | null;
  purchaseComplete?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("About");
  const { formatCoursePrice } = useCurrency();
  const outcomes = course.learning_outcomes ?? [];
  const modules = [...course.modules].sort((a, b) => a.position - b.position);
  const instructorName = course.instructor_name ?? ORG.instructor;
  const hasRating = typeof course.rating === "number" && course.rating > 0;
  const showEnrollmentCount = typeof enrollmentCount === "number" && enrollmentCount > 0;
  const hasCourseAccess = isEnrolled || purchaseComplete;

  const purchaseCard = (
    <div className="border border-neutral-200 bg-white p-6">
      <p className="font-display text-3xl font-bold tabular-nums tracking-tight text-brand">
        <PriceDisplay course={course} />
      </p>
      <p className="mt-1 text-xs text-neutral-400">One-time · Lifetime access</p>
      {purchaseComplete && !isLoggedIn ? (
        <div className="mt-5 border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Enrollment complete</p>
          <p className="mt-1 text-green-800">
            Check your email for login details, then sign in to start learning.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/courses/${course.id}`)}`}
            className="mt-3 inline-flex h-11 w-full items-center justify-center bg-brand text-sm font-bold text-white hover:bg-brand-700"
          >
            Log in to start learning
          </Link>
        </div>
      ) : (
        <EnrollButton
          courseId={course.id}
          priceNgn={course.price_ngn}
          priceUsd={course.price_usd}
          isEnrolled={hasCourseAccess}
          isLoggedIn={isLoggedIn}
          className="mt-5"
        />
      )}
      <ul className="mt-6 space-y-2.5 border-t border-neutral-200 pt-6 text-sm text-neutral-500">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
          Full lifetime access
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
          {lessonCount} on-demand lessons
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-brand" />
          Certificate of completion
        </li>
      </ul>
    </div>
  );

  const metaRow = (
    <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-neutral-400">
      {hasRating ? (
        <span className="font-medium text-neutral-800">{course.rating!.toFixed(1)} rating</span>
      ) : null}
      {hasRating && (showEnrollmentCount || lessonCount) ? <span aria-hidden>·</span> : null}
      {showEnrollmentCount ? (
        <span>{enrollmentCount!.toLocaleString()} enrolled</span>
      ) : null}
      {showEnrollmentCount && lessonCount ? <span aria-hidden>·</span> : null}
      <span>{lessonCount} lessons</span>
      <span aria-hidden>·</span>
      <span>Self-paced</span>
    </div>
  );

  return (
    <>
      {/* Mobile hero */}
      <section className="overflow-x-hidden border-b border-neutral-200 lg:hidden">
        <CourseHeroMedia
          title={course.title}
          thumbnailUrl={course.thumbnail_url}
          promoVideoUrl={course.promo_video_url}
          priority
        />
        <div className="px-4 py-6">
          {course.category_name ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              {course.category_name}
            </p>
          ) : null}
          <h1 className="mt-2 font-display text-[1.75rem] font-bold leading-[1.1] text-neutral-950">
            {course.title}
          </h1>
          <p className="mt-3 text-base text-neutral-600">
            {course.short_description ?? course.description}
          </p>
          {metaRow}
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] overflow-x-hidden px-4 py-10 sm:px-8 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="min-w-0">
            {/* Desktop hero text */}
            <div className="hidden lg:block">
              {course.category_name ? (
                <p className="text-sm font-medium text-neutral-500">{course.category_name}</p>
              ) : null}
              <h1 className="mt-2 font-display text-4xl font-bold leading-[1.08] text-neutral-950 lg:text-[2.75rem]">
                {course.title}
              </h1>
              <p className="mt-4 text-lg text-neutral-600">
                {course.short_description ?? course.description}
              </p>
              {metaRow}
            </div>

            <CourseHeroMedia
              title={course.title}
              thumbnailUrl={course.thumbnail_url}
              promoVideoUrl={course.promo_video_url}
              className="mt-10 hidden border border-neutral-200 lg:block"
            />

            {/* Tabs */}
            <div className="mt-12 border-b border-neutral-200">
              <div className="flex gap-8 overflow-x-auto pb-px [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "shrink-0 border-b-2 pb-3 text-[13px] font-semibold uppercase tracking-wider transition min-h-[44px]",
                      tab === t
                        ? "border-neutral-950 text-neutral-950"
                        : "border-transparent text-neutral-400 hover:text-neutral-700",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="py-8">
              {tab === "About" ? (
                <div className="space-y-8">
                  {course.description ? (
                    <div className="prose prose-neutral max-w-none text-neutral-600">
                      <p>{course.description}</p>
                    </div>
                  ) : null}
                  {outcomes.length > 0 ? (
                    <div>
                      <h2 className="font-display text-xl font-bold text-neutral-900">
                        What you&apos;ll learn
                      </h2>
                      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                        {outcomes.map((item) => (
                          <li key={item} className="flex gap-3 text-sm text-neutral-700">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {tab === "Curriculum" ? <CurriculumAccordion modules={modules} /> : null}

              {tab === "Instructor" ? (
                <div className="border border-neutral-200 bg-white p-6 sm:p-8">
                  <div className="flex items-start gap-5">
                    <div
                      className="flex h-16 w-16 shrink-0 items-center justify-center bg-neutral-950 font-display text-xl font-bold text-white"
                      aria-hidden
                    >
                      {instructorInitials(instructorName)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-lg font-semibold text-neutral-900">
                        {instructorName}
                      </p>
                      <p className="mt-0.5 text-sm text-neutral-500">Course instructor</p>
                    </div>
                  </div>
                  {course.instructor_bio ? (
                    <p className="mt-5 text-sm leading-relaxed text-neutral-600">
                      {course.instructor_bio}
                    </p>
                  ) : (
                    <p className="mt-5 text-sm text-neutral-500">
                      Experienced industry practitioner.
                    </p>
                  )}
                </div>
              ) : null}

              {tab === "Reviews" ? (
                <div className="border border-dashed border-neutral-300 px-6 py-16">
                  <p className="font-display text-lg font-semibold text-neutral-800">No reviews yet</p>
                  <p className="mt-2 text-sm text-neutral-500">
                    Be the first to share your experience after completing this course.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-20">{purchaseCard}</div>
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-8 border-t border-neutral-200 pt-12 pb-24 lg:pb-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
              You may also like
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-neutral-950">Related courses</h2>
            <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </section>
        ) : (
          <div className="pb-24 lg:pb-0" />
        )}
      </div>

      {/* Mobile sticky purchase bar */}
      {!hasCourseAccess ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-4 lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500">Total price</p>
              <p className="truncate text-xl font-bold text-brand">{formatCoursePrice(course)}</p>
            </div>
            <EnrollButton
              courseId={course.id}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={hasCourseAccess}
              isLoggedIn={isLoggedIn}
              size="bar"
            />
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-4 lg:hidden">
          {purchaseComplete && !isLoggedIn ? (
            <Link
              href={`/login?next=${encodeURIComponent(`/courses/${course.id}`)}`}
              className="mx-auto flex h-12 max-w-lg items-center justify-center bg-brand text-sm font-bold text-white hover:bg-brand-700"
            >
              Log in to start learning
            </Link>
          ) : (
            <EnrollButton
              courseId={course.id}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={hasCourseAccess}
              isLoggedIn={isLoggedIn}
              label="Continue Learning"
              className="mx-auto max-w-lg"
            />
          )}
        </div>
      )}
    </>
  );
}
