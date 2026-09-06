"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { CourseMediaImage } from "@/components/marketplace/course-media-image";
import { reasonLabel, type CourseRecommendation, type RecommendableCourse } from "@/lib/recommendations";
import { trackProductEvent } from "@/lib/product-analytics";
import { cn } from "@/lib/utils";

export function RecommendationRail({
  title = "Recommended for you",
  subtitle,
  items,
  className,
  trackAs,
  seedCourseId,
}: {
  title?: string;
  subtitle?: string;
  items: CourseRecommendation[];
  className?: string;
  trackAs?: "product_recommendation" | "upsell";
  seedCourseId?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={cn("", className)}>
      <div>
        <h2 className="font-display text-lg font-bold text-neutral-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      <ul className="mt-5 divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
        {items.map(({ course, reason }) => (
          <li key={course.id}>
            <RecommendationRow
              course={course}
              reason={reason}
              trackAs={trackAs}
              seedCourseId={seedCourseId}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecommendationRow({
  course,
  reason,
  trackAs,
  seedCourseId,
}: {
  course: RecommendableCourse;
  reason?: CourseRecommendation["reason"];
  trackAs?: "product_recommendation" | "upsell";
  seedCourseId?: string;
}) {
  const label = reasonLabel(reason);
  const blurb = course.short_description ?? course.description;

  return (
    <Link
      href={`/course/${course.id}`}
      onClick={() => {
        void trackProductEvent({
          event: "recommendation_click",
          courseId: course.id,
          metadata: { reason: reason ?? null, seed_course_id: seedCourseId ?? null },
        });
        if (trackAs === "upsell") {
          void trackProductEvent({
            event: "upsell_click",
            courseId: course.id,
            metadata: { seed_course_id: seedCourseId ?? null },
          });
        } else if (trackAs === "product_recommendation") {
          void trackProductEvent({
            event: "product_recommendation_click",
            courseId: course.id,
            metadata: { seed_course_id: seedCourseId ?? null, reason: reason ?? null },
          });
        }
      }}
      className="group flex min-h-[64px] items-center gap-4 px-4 py-4 hover:bg-neutral-50"
    >
      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md bg-neutral-100 sm:h-16 sm:w-28">
        <CourseMediaImage
          src={course.thumbnail_url}
          alt={course.title}
          title={course.title}
          aspect="none"
          sizes="112px"
          placeholderSize="compact"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <div className="min-w-0 flex-1">
        {label ? (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {label}
          </p>
        ) : null}
        <p className="mt-0.5 line-clamp-1 font-display text-[15px] font-semibold text-neutral-900 group-hover:text-brand">
          {course.title}
        </p>
        {blurb ? (
          <p className="mt-0.5 line-clamp-1 text-sm text-neutral-500">{blurb}</p>
        ) : null}
      </div>
      <div className="hidden shrink-0 items-center gap-3 sm:flex">
        <span className="text-sm font-semibold tabular-nums text-brand">
          <PriceDisplay
            course={{
              price_ngn: course.price_ngn ?? 0,
              price_usd: course.price_usd ?? 0,
            }}
          />
        </span>
        <ArrowRight className="h-4 w-4 text-neutral-400 group-hover:text-brand" />
      </div>
    </Link>
  );
}
