import Link from "next/link";
import { CourseCard, type MarketplaceCourse } from "@/components/marketplace/course-card";

export function HomepageCourseGrid({
  courses,
  emptyLabel,
}: {
  courses: MarketplaceCourse[];
  emptyLabel?: string;
}) {
  if (courses.length === 0) {
    if (!emptyLabel) return null;
    return (
      <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="mt-8 grid min-w-0 grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
      {courses.map((course) => (
        <CourseCard key={course.id} course={course} />
      ))}
    </div>
  );
}

export function HomepageSectionHeader({
  id,
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div id={id} className="scroll-mt-24 flex items-end justify-between gap-6">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {eyebrow}
          </p>
        ) : null}
        <h2
          className={`font-display text-2xl font-bold tracking-tight text-neutral-950 sm:text-3xl ${
            eyebrow ? "mt-2" : ""
          }`}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500 sm:text-[15px]">{description}</p>
      </div>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="hidden shrink-0 text-sm font-medium text-neutral-600 hover:text-brand sm:inline-flex"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}
