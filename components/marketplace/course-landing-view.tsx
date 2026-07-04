"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Users } from "lucide-react";
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
};

const TABS = ["About", "Curriculum", "Instructor"] as const;

export function CourseLandingView({
  course,
  isEnrolled,
  isLoggedIn,
  related,
  lessonCount,
  purchaseComplete = false,
}: {
  course: CourseData;
  isEnrolled: boolean;
  isLoggedIn: boolean;
  related: MarketplaceCourse[];
  lessonCount: number;
  purchaseComplete?: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("About");
  const { formatCoursePrice } = useCurrency();
  const outcomes = course.learning_outcomes ?? [];
  const modules = [...course.modules].sort((a, b) => a.position - b.position);

  const purchaseCard = (
    <div className="rounded-xl border border-surface-border bg-white p-5 shadow-card">
      <p className="text-3xl font-bold text-neutral-900">
        <PriceDisplay course={course} />
      </p>
      <p className="mt-1 text-xs text-neutral-500">One-time payment · Lifetime access</p>
      {purchaseComplete && !isEnrolled ? (
        <div className="mt-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Enrollment complete</p>
          <p className="mt-1 text-green-800">
            Check your email for login details, then sign in to start learning.
          </p>
          {!isLoggedIn ? (
            <Link
              href="/login"
              className="mt-3 inline-flex h-11 w-full items-center justify-center rounded-lg bg-brand text-sm font-bold text-white hover:bg-brand-700"
            >
              Log in
            </Link>
          ) : null}
        </div>
      ) : (
        <EnrollButton
          courseId={course.id}
          priceNgn={course.price_ngn}
          priceUsd={course.price_usd}
          isEnrolled={isEnrolled}
          isLoggedIn={isLoggedIn}
          className="mt-5"
        />
      )}
      <ul className="mt-6 space-y-3 border-t border-surface-border pt-5 text-sm text-neutral-600">
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-brand" />
          Full lifetime access
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-brand" />
          {lessonCount} on-demand lessons
        </li>
        <li className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-brand" />
          Certificate of completion
        </li>
      </ul>
    </div>
  );

  return (
    <>
      {/* Mobile hero: video/image first */}
      <section className="border-b border-surface-border lg:hidden">
        <CourseHeroMedia
          title={course.title}
          thumbnailUrl={course.thumbnail_url}
          promoVideoUrl={course.promo_video_url}
          priority
        />
        <div className="px-4 py-6">
          {course.category_name ? (
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              {course.category_name}
            </p>
          ) : null}
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-neutral-900">
            {course.title}
          </h1>
          <p className="mt-3 text-base text-neutral-600">
            {course.short_description ?? course.description}
          </p>
          <div className="mt-4 flex items-center gap-4 text-sm text-neutral-500">
            <span className="inline-flex items-center gap-1">
              <Users className="h-4 w-4" />
              Self-paced
            </span>
            <span>{lessonCount} lessons</span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="grid gap-10 lg:grid-cols-[1fr_340px] lg:items-start">
          <div className="min-w-0">
            {/* Desktop hero text */}
            <div className="hidden lg:block">
              {course.category_name ? (
                <p className="text-sm text-neutral-500">{course.category_name}</p>
              ) : null}
              <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-neutral-900">
                {course.title}
              </h1>
              <p className="mt-4 text-lg text-neutral-600">
                {course.short_description ?? course.description}
              </p>
              <div className="mt-4 flex items-center gap-4 text-sm text-neutral-500">
                <span className="inline-flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  Self-paced
                </span>
                <span>{lessonCount} lessons</span>
              </div>
            </div>

            {/* Desktop video / product image */}
            <CourseHeroMedia
              title={course.title}
              thumbnailUrl={course.thumbnail_url}
              promoVideoUrl={course.promo_video_url}
              className="mt-8 hidden lg:block rounded-xl border border-surface-border shadow-sm"
            />

            {/* Tabs */}
            <div className="mt-8 border-b border-surface-border">
              <div className="flex gap-6 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      "shrink-0 border-b-2 pb-3 text-sm font-semibold transition",
                      tab === t
                        ? "border-brand text-neutral-900"
                        : "border-transparent text-neutral-500 hover:text-neutral-800",
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

              {tab === "Curriculum" ? (
                <CurriculumAccordion modules={modules} />
              ) : null}

              {tab === "Instructor" ? (
                <div className="rounded-xl border border-surface-border bg-white p-6">
                  <p className="font-display text-lg font-semibold text-neutral-900">
                    {course.instructor_name ?? ORG.instructor}
                  </p>
                  {course.instructor_bio ? (
                    <p className="mt-3 text-sm leading-relaxed text-neutral-600">
                      {course.instructor_bio}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm text-neutral-500">Experienced industry practitioner.</p>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Desktop sticky purchase card */}
          <aside className="hidden lg:block">
            <div className="sticky top-20">{purchaseCard}</div>
          </aside>
        </div>

        {related.length > 0 ? (
          <section className="mt-4 border-t border-surface-border pt-10 pb-24 lg:pb-10">
            <h2 className="font-display text-xl font-bold text-neutral-900">Related courses</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {related.slice(0, 2).map((c) => (
                <CourseCard key={c.id} course={c} />
              ))}
            </div>
          </section>
        ) : (
          <div className="pb-24 lg:pb-0" />
        )}
      </div>

      {/* Mobile sticky purchase bar */}
      {!isEnrolled && !purchaseComplete ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-white p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] lg:hidden">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-4">
            <div>
              <p className="text-xs text-neutral-500">Total price</p>
              <p className="text-xl font-bold text-neutral-900">{formatCoursePrice(course)}</p>
            </div>
            <EnrollButton
              courseId={course.id}
              priceNgn={course.price_ngn}
              priceUsd={course.price_usd}
              isEnrolled={isEnrolled}
              isLoggedIn={isLoggedIn}
              size="bar"
            />
          </div>
        </div>
      ) : (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-border bg-white p-4 lg:hidden">
          <EnrollButton
            courseId={course.id}
            priceNgn={course.price_ngn}
            priceUsd={course.price_usd}
            isEnrolled={isEnrolled}
            isLoggedIn={isLoggedIn}
            label="Continue Learning"
            className="mx-auto max-w-lg"
          />
        </div>
      )}
    </>
  );
}
