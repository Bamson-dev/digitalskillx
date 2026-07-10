import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { CourseHeroMedia } from "@/components/marketplace/course-hero-media";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { CourseCommunitySection } from "@/components/course/course-community-section";
import { Badge } from "@/components/ui/badge";
import type { CourseCommunityLinks } from "@/lib/course-community";
import { hasCourseCommunity } from "@/lib/course-community";
import { cn } from "@/lib/utils";

type CourseComingSoonViewProps = {
  title: string;
  description?: string | null;
  shortDescription?: string | null;
  thumbnailUrl?: string | null;
  promoVideoUrl?: string | null;
  learningOutcomes?: string[];
  categoryName?: string | null;
  instructorName?: string | null;
  communityLinks?: CourseCommunityLinks;
  /** Student portal: link back to enrolled courses list. */
  backHref?: string;
  backLabel?: string;
  /** Compact layout for the signed-in student course page. */
  variant?: "marketplace" | "student";
  className?: string;
};

export function CourseComingSoonView({
  title,
  description,
  shortDescription,
  thumbnailUrl,
  promoVideoUrl,
  learningOutcomes = [],
  categoryName,
  instructorName,
  communityLinks,
  backHref,
  backLabel = "Back to courses",
  variant = "marketplace",
  className,
}: CourseComingSoonViewProps) {
  const blurb = shortDescription ?? description;
  const outcomes = learningOutcomes.filter(Boolean);
  const isStudent = variant === "student";
  const showCommunity = communityLinks && hasCourseCommunity(communityLinks);

  return (
    <div className={cn("space-y-8", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
      ) : null}

      {!isStudent ? (
        <>
          <section className="overflow-x-hidden border-b border-neutral-200 lg:hidden">
            <CourseHeroMedia
              title={title}
              thumbnailUrl={thumbnailUrl ?? null}
              promoVideoUrl={promoVideoUrl ?? null}
              priority
            />
            <div className="px-4 py-6">
              {categoryName ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  {categoryName}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="font-display text-[1.75rem] font-bold leading-[1.1] text-neutral-950">
                  {title}
                </h1>
                <Badge tone="amber">Coming soon</Badge>
              </div>
              {blurb ? <p className="mt-3 text-base text-neutral-600">{blurb}</p> : null}
            </div>
          </section>

          <div className="mx-auto max-w-[1200px] overflow-x-hidden px-4 sm:px-8">
            <div className="hidden lg:block">
              {categoryName ? (
                <p className="text-sm font-medium text-neutral-500">{categoryName}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-4">
                <h1 className="font-display text-4xl font-bold leading-[1.08] text-neutral-950 lg:text-[2.75rem]">
                  {title}
                </h1>
                <Badge tone="amber">Coming soon</Badge>
              </div>
              {blurb ? <p className="mt-4 max-w-3xl text-lg text-neutral-600">{blurb}</p> : null}
            </div>

            <CourseHeroMedia
              title={title}
              thumbnailUrl={thumbnailUrl ?? null}
              promoVideoUrl={promoVideoUrl ?? null}
              className="mt-10 hidden border border-neutral-200 lg:block"
            />
          </div>
        </>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{title}</h1>
            <Badge tone="amber">Coming soon</Badge>
          </div>
          {blurb ? <p className="mt-1 text-sm text-muted">{blurb}</p> : null}
        </div>
      )}

      {showCommunity && isStudent ? (
        <div className="mx-auto max-w-[1200px] px-0">
          <CourseCommunitySection
            links={communityLinks}
            courseTitle={title}
            variant="compact"
          />
        </div>
      ) : null}

      <div
        className={cn(
          "mx-auto max-w-[1200px] px-4 sm:px-8",
          isStudent && "max-w-none px-0",
        )}
      >
        <div
          className={cn(
            "overflow-hidden border border-neutral-200 bg-white",
            isStudent && "rounded-xl border-surface-border",
          )}
        >
          <div className="grid gap-0 lg:grid-cols-[1fr_320px]">
            <div className="border-b border-neutral-200 p-6 sm:p-8 lg:border-b-0 lg:border-r">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                  <Clock className="h-6 w-6" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold text-neutral-950">
                    Course content is on the way
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                    We&apos;re finishing production on this course. You can preview what it covers
                    below — full lessons, progress tracking, and certificates unlock when content
                    goes live.
                  </p>
                </div>
              </div>

              {description && description !== blurb ? (
                <div className="mt-8 border-t border-neutral-100 pt-8">
                  <h2 className="font-display text-lg font-semibold text-neutral-900">About this course</h2>
                  <p className="mt-3 text-sm leading-relaxed text-neutral-600">{description}</p>
                </div>
              ) : null}

              {outcomes.length > 0 ? (
                <div className="mt-8 border-t border-neutral-100 pt-8">
                  <h2 className="font-display text-lg font-semibold text-neutral-900">
                    What you&apos;ll learn
                  </h2>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2">
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

            <aside className="bg-neutral-50 p-6 sm:p-8">
              {isStudent && thumbnailUrl ? (
                <div className="relative mb-6 aspect-[16/10] overflow-hidden rounded-lg bg-neutral-100 lg:hidden">
                  <Image src={thumbnailUrl} alt="" fill className="object-cover" sizes="400px" />
                </div>
              ) : null}
              {!isStudent && !thumbnailUrl && !promoVideoUrl ? (
                <div className="relative mb-6 hidden aspect-[4/3] overflow-hidden bg-neutral-100 lg:block">
                  <CourseThumbnailPlaceholder title={title} />
                </div>
              ) : null}

              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                Status
              </p>
              <p className="mt-2 font-display text-2xl font-bold text-neutral-950">Coming soon</p>
              <p className="mt-2 text-sm text-neutral-500">
                Enrollment and lesson access open once recording is complete.
              </p>

              {instructorName ? (
                <div className="mt-8 border-t border-neutral-200 pt-6">
                  <p className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                    Instructor
                  </p>
                  <p className="mt-1 font-semibold text-neutral-900">{instructorName}</p>
                </div>
              ) : null}

              {!isStudent ? (
                <Link
                  href="/browse"
                  className="mt-8 inline-flex h-11 w-full items-center justify-center bg-brand text-sm font-bold text-white hover:bg-brand-700"
                >
                  Browse available courses
                </Link>
              ) : null}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
