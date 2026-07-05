"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock } from "lucide-react";
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
  rating?: number | null;
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
  const blurb = course.short_description ?? course.description ?? "Self-paced digital skills training.";
  const category = course.category_name ?? "Course";
  const instructor = course.instructor_name ?? "DigitalSkillX";

  if (variant === "compact") {
    return (
      <Link
        href={`/course/${course.id}`}
        className={cn(
          "flex min-h-[44px] gap-3 rounded-xl border border-surface-border bg-white p-3 transition hover:border-neutral-300 hover:shadow-card",
          className,
        )}
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
          {course.thumbnail_url ? (
            <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="64px" />
          ) : (
            <CourseThumbnailPlaceholder title={course.title} size="compact" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-neutral-900">{course.title}</p>
          <p className="mt-1 text-sm font-bold text-brand">{formatCoursePrice(course)}</p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={`/course/${course.id}`}
      className={cn(
        "group flex min-h-[44px] flex-col overflow-hidden rounded-xl border border-surface-border bg-white transition hover:border-neutral-300 hover:shadow-card active:scale-[0.99] sm:active:scale-100",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, 33vw"
          />
        ) : (
          <CourseThumbnailPlaceholder title={course.title} />
        )}
        <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-700 shadow-sm">
          {category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span className="line-clamp-1 font-medium text-neutral-600">{instructor}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Self-paced
          </span>
        </div>
        <h3 className="line-clamp-2 font-display text-base font-bold text-neutral-900 sm:text-lg">
          {course.title}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-neutral-500">
          {blurb}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-surface-border pt-4">
          <span className="text-lg font-bold text-brand">{formatCoursePrice(course)}</span>
          <span className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition group-hover:bg-brand-700">
            View Course
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
      className="group flex min-h-[44px] flex-col overflow-hidden rounded-xl border border-surface-border bg-white sm:flex-row"
    >
      <div className="relative aspect-video w-full shrink-0 sm:aspect-auto sm:h-auto sm:w-48 md:w-56">
        {course.thumbnail_url ? (
          <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="224px" />
        ) : (
          <CourseThumbnailPlaceholder title={course.title} />
        )}
        {badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-brand/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col justify-center p-4 sm:p-5">
        <h3 className="font-display text-lg font-bold text-neutral-900 group-hover:text-brand">
          {course.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
          {course.short_description ?? course.description}
        </p>
        <p className="mt-4 text-sm font-bold text-brand">{formatCoursePrice(course)}</p>
      </div>
    </Link>
  );
}
