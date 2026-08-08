"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { reasonLabel, type CourseRecommendation, type RecommendableCourse } from "@/lib/recommendations";
import { trackProductEvent } from "@/lib/product-analytics";
import { cn } from "@/lib/utils";

export function RecommendationRail({
  title = "Recommended for you",
  subtitle,
  items,
  className,
}: {
  title?: string;
  subtitle?: string;
  items: CourseRecommendation[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <section className={cn("", className)}>
      <div>
        <h2 className="font-display text-lg font-bold text-neutral-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-neutral-500">{subtitle}</p> : null}
      </div>
      <ul className="mt-5 divide-y divide-neutral-200 border-y border-neutral-200">
        {items.map(({ course, reason }) => (
          <li key={course.id}>
            <RecommendationRow course={course} reason={reason} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecommendationRow({
  course,
  reason,
}: {
  course: RecommendableCourse;
  reason?: CourseRecommendation["reason"];
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
          metadata: { reason: reason ?? null },
        });
      }}
      className="group flex min-h-[64px] items-center gap-4 py-4"
    >
      <div className="relative h-14 w-20 shrink-0 overflow-hidden bg-neutral-100 sm:h-16 sm:w-24">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt=""
            fill
            className="object-cover"
            sizes="96px"
          />
        ) : (
          <div className="h-full w-full bg-neutral-100" />
        )}
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
