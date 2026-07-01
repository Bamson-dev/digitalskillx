"use client";

import Image from "next/image";
import Link from "next/link";
import { BookOpen, Clock, Star } from "lucide-react";
import { useCurrency } from "@/components/providers/currency-provider";
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

  if (variant === "compact") {
    return (
      <Link
        href={`/course/${course.id}`}
        className={cn(
          "flex gap-3 rounded-xl border border-surface-border bg-white p-3 transition hover:border-neutral-300 hover:shadow-card",
          className,
        )}
      >
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
          {course.thumbnail_url ? (
            <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="64px" />
          ) : (
            <div className="flex h-full items-center justify-center text-brand/50">
              <BookOpen className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-semibold text-neutral-900">{course.title}</p>
          <p className="mt-1 text-sm font-bold text-neutral-900">{formatCoursePrice(course)}</p>
        </div>
      </Link>
    );
  }

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-surface-border bg-white transition hover:border-neutral-300 hover:shadow-card",
        className,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-neutral-100">
        {course.thumbnail_url ? (
          <Image
            src={course.thumbnail_url}
            alt={course.title}
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 640px) 100vw, 33vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-brand/40">
            <BookOpen className="h-12 w-12" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-md bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-neutral-700 shadow-sm">
          {category}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
          <span className="inline-flex items-center gap-1 font-semibold text-neutral-800">
            <Star className="h-3.5 w-3.5 fill-brand text-brand" />
            4.9
          </span>
          <span className="inline-flex items-center gap-1">
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
          <span className="text-lg font-bold text-neutral-900">{formatCoursePrice(course)}</span>
          <Link
            href={`/course/${course.id}`}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            View Course
          </Link>
        </div>
      </div>
    </article>
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
      className="group flex flex-col overflow-hidden rounded-xl border border-surface-border bg-white sm:flex-row"
    >
      <div className="relative aspect-video w-full shrink-0 bg-neutral-100 sm:aspect-auto sm:w-48 md:w-56">
        {course.thumbnail_url ? (
          <Image src={course.thumbnail_url} alt="" fill className="object-cover" sizes="224px" />
        ) : (
          <div className="flex h-full min-h-[120px] items-center justify-center text-brand/40">
            <BookOpen className="h-10 w-10" />
          </div>
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
        <div className="mt-4 flex items-center gap-2">
          <Star className="h-4 w-4 fill-brand text-brand" />
          <span className="text-sm font-bold text-neutral-900">{formatCoursePrice(course)}</span>
        </div>
      </div>
    </Link>
  );
}
