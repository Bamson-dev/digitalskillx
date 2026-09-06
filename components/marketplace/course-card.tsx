"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
import { CourseMediaImage } from "@/components/marketplace/course-media-image";
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
  const isFree = !course.is_coming_soon && course.price_ngn === 0 && course.price_usd === 0;

  if (variant === "compact") {
    return (
      <Link
        href={`/course/${course.id}`}
        className={cn(
          "group flex min-h-[44px] gap-4 border-b border-neutral-200 py-4 transition hover:border-neutral-400",
          className,
        )}
      >
        <div className="relative h-[72px] w-[128px] shrink-0 overflow-hidden rounded-md bg-neutral-100">
          <CourseMediaImage
            src={course.thumbnail_url}
            alt={course.title}
            title={course.title}
            aspect="none"
            sizes="128px"
            placeholderSize="compact"
            className="absolute inset-0 h-full w-full"
          />
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
            {course.is_coming_soon ? "Coming soon" : isFree ? "Free" : formatCoursePrice(course)}
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/course/${course.id}`}
      className={cn(
        "group flex h-full min-h-[44px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-neutral-400 hover:shadow-sm",
        className,
      )}
    >
      <div className="relative">
        <CourseMediaImage
          src={course.thumbnail_url}
          alt={course.title}
          title={course.title}
          aspect="video"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          frameClassName="rounded-t-xl"
        />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {course.is_coming_soon ? (
            <span className="bg-neutral-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              Coming soon
            </span>
          ) : isFree ? (
            <span className="bg-emerald-700 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              Free
            </span>
          ) : (
            <span className="bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-800 shadow-sm">
              Paid
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-medium uppercase tracking-wider text-neutral-500">
          {category ? <span>{category}</span> : null}
          {category && instructor ? <span aria-hidden>·</span> : null}
          {instructor ? <span className="line-clamp-1">{instructor}</span> : null}
        </div>
        <h3 className="mt-1.5 line-clamp-2 min-h-[2.5rem] font-display text-[17px] font-bold leading-[1.25] text-neutral-950 sm:text-lg">
          {course.title}
        </h3>
        {blurb ? (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-neutral-500">{blurb}</p>
        ) : (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-transparent" aria-hidden>
            &nbsp;
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          {course.is_coming_soon ? (
            <span className="text-sm font-semibold uppercase tracking-wider text-neutral-600">
              Coming soon
            </span>
          ) : (
            <span className="font-display text-xl font-bold tabular-nums tracking-tight text-brand">
              {isFree ? "Free" : formatCoursePrice(course)}
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
      className="group flex min-h-[44px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white py-0 transition hover:border-neutral-400 sm:flex-row sm:gap-0"
    >
      <div className="relative w-full shrink-0 sm:w-52">
        <CourseMediaImage
          src={course.thumbnail_url}
          alt={course.title}
          title={course.title}
          aspect="video"
          sizes="208px"
          frameClassName="rounded-t-xl sm:rounded-l-xl sm:rounded-tr-none"
        />
        {badge ? (
          <span className="absolute left-3 top-3 bg-brand px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
        <h3 className="line-clamp-2 font-display text-xl font-bold text-neutral-950">{course.title}</h3>
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

export function CourseCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white" aria-hidden>
      <div className="aspect-video animate-pulse bg-neutral-200/80" />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="h-3 w-1/3 animate-pulse rounded bg-neutral-200/80" />
        <div className="h-5 w-4/5 animate-pulse rounded bg-neutral-200/80" />
        <div className="h-4 w-full animate-pulse rounded bg-neutral-200/80" />
        <div className="h-6 w-1/4 animate-pulse rounded bg-neutral-200/80" />
      </div>
    </div>
  );
}
