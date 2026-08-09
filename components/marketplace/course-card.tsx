"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { cn } from "@/lib/utils";

export type MarketplaceCourse = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  instructor_name?: string | null;
  category_name?: string | null;
  is_coming_soon?: boolean;
  rating?: number | null;
  created_at?: string | null;
};

export function CourseCard({
  course,
  className,
  variant = "grid",
}: {
  course: MarketplaceCourse;
  className?: string;
  variant?: "grid" | "compact";
}) {
  const { formatCoursePrice } = useCurrency();
  const blurb = course.short_description ?? course.description;
  const category = course.category_name?.trim() || null;
  const instructor = course.instructor_name?.trim() || null;

  if (variant === "compact") {
    return (
      <Link
        href={`/course/${course.id}`}
        className={cn(
          "group flex min-h-[44px] gap-4 border-b border-neutral-200 py-4",
          className,
        )}
      >
        <div className="relative h-[72px] w-[108px] shrink-0 overflow-hidden bg-neutral-100">
          {course.thumbnail_url ? (
            <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="108px" />
          ) : (
            <CourseThumbnailPlaceholder title={course.title} size="compact" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {instructor ? (
            <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500">
              {instructor}
            </p>
          ) : null}
          <p className="mt-0.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-neutral-900">
            {course.title}
          </p>
          <p className="mt-2 text-[15px] font-semibold tabular-nums text-brand">
            {formatCoursePrice(course)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/course/${course.id}`}
      className={cn("group flex min-h-[44px] flex-col", className)}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-100">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, 33vw"
          />
        ) : (
          <CourseThumbnailPlaceholder title={course.title} />
        )}
        {course.is_coming_soon ? (
          <span className="absolute left-0 top-0 bg-neutral-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Coming soon
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          {category ? <span>{category}</span> : null}
          {category && instructor ? <span aria-hidden>·</span> : null}
          {instructor ? <span>{instructor}</span> : null}
        </div>
        <h3 className="mt-1.5 line-clamp-2 font-display text-[17px] font-bold leading-[1.25] text-neutral-950 sm:text-lg">
          {course.title}
        </h3>
        {blurb ? (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">{blurb}</p>
        ) : null}
        <div className="mt-4 flex items-end justify-between gap-3">
          {course.is_coming_soon ? (
            <span className="text-sm font-semibold uppercase tracking-wider text-neutral-600">
              Coming soon
            </span>
          ) : (
            <span className="font-display text-xl font-bold tabular-nums tracking-tight text-brand">
              {formatCoursePrice(course)}
            </span>
          )}
          <span className="inline-flex items-center gap-0.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 transition group-hover:text-brand">
            View
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export function CourseCardHorizontal({
  course,
  badge,
}: {
  course: MarketplaceCourse;
  badge?: string;
}) {
  const { formatCoursePrice } = useCurrency();

  return (
    <Link
      href={`/course/${course.id}`}
      className="group flex min-h-[44px] flex-col border-b border-neutral-200 py-5 sm:flex-row sm:gap-6 sm:border-b sm:py-6"
    >
      <div className="relative aspect-[4/3] w-full shrink-0 bg-neutral-100 sm:aspect-auto sm:h-auto sm:w-52">
        {course.thumbnail_url ? (
          <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="208px" />
        ) : (
          <CourseThumbnailPlaceholder title={course.title} />
        )}
        {badge ? (
          <span className="absolute left-0 top-0 bg-brand px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-center pt-4 sm:pt-0">
        <h3 className="font-display text-xl font-bold text-neutral-950">{course.title}</h3>
        {(course.short_description ?? course.description) ? (
          <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
            {course.short_description ?? course.description}
          </p>
        ) : null}
        <p className="mt-4 font-display text-lg font-bold tabular-nums text-brand">
          {formatCoursePrice(course)}
        </p>
      </div>
    </Link>
  );
}
