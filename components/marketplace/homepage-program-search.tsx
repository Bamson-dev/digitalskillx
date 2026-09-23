"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import Link from "next/link";
import { CourseCard, type MarketplaceCourse } from "@/components/marketplace/course-card";
import { LearnPathCard, type LearnPathCardData } from "@/components/learn/learn-path-card";
import {
  HomepageCourseGrid,
  HomepageSectionHeader,
} from "@/components/marketplace/homepage-course-grid";

function matchesQuery(
  query: string,
  parts: Array<string | null | undefined>,
): boolean {
  if (!query) return true;
  const haystack = parts.filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(query);
}

export function HomepageProgramSearch({
  freeCourses,
  paidCourses,
  freeLibrary,
  freeLibraryTotal,
  hasMorePaid,
}: {
  freeCourses: MarketplaceCourse[];
  paidCourses: MarketplaceCourse[];
  freeLibrary: LearnPathCardData[];
  freeLibraryTotal: number;
  hasMorePaid: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const filteredFree = useMemo(
    () =>
      freeCourses.filter((c) =>
        matchesQuery(normalized, [c.title, c.short_description, c.description, c.instructor_name, c.category_name]),
      ),
    [freeCourses, normalized],
  );
  const filteredPaid = useMemo(
    () =>
      paidCourses.filter((c) =>
        matchesQuery(normalized, [c.title, c.short_description, c.description, c.instructor_name, c.category_name]),
      ),
    [paidCourses, normalized],
  );
  const filteredLibrary = useMemo(
    () =>
      freeLibrary.filter((p) =>
        matchesQuery(normalized, [p.title, p.short_description, p.category, p.creator_name, p.difficulty]),
      ),
    [freeLibrary, normalized],
  );

  const totalMatches =
    filteredFree.length + filteredPaid.length + filteredLibrary.length;
  const searching = normalized.length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) {
      document.getElementById("courses")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // Prefer the free learning library — it holds the bulk of programs.
    router.push(`/learn?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="mt-12 space-y-16 sm:mt-14 sm:space-y-20">
      <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
        <label htmlFor="homepage-program-search" className="sr-only">
          Search courses and free learning programs
        </label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400"
            aria-hidden
          />
          <input
            id="homepage-program-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search free programs, premium courses, skills…"
            className="h-14 w-full border border-neutral-300 bg-white pl-12 pr-28 text-base text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
            autoComplete="off"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 inline-flex h-10 -translate-y-1/2 items-center bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Search
          </button>
        </div>
        <p className="mt-3 text-center text-sm text-neutral-500">
          {searching
            ? `${totalMatches} match${totalMatches === 1 ? "" : "es"} on this page`
            : "Filter programs below, or search the full free library."}
          {searching ? (
            <>
              {" "}
              ·{" "}
              <Link href={`/learn?q=${encodeURIComponent(query.trim())}`} className="font-medium text-brand hover:underline">
                Search all free learning
              </Link>
              {" · "}
              <Link href={`/browse?q=${encodeURIComponent(query.trim())}`} className="font-medium text-brand hover:underline">
                Search courses
              </Link>
            </>
          ) : null}
        </p>
      </form>

      {searching && totalMatches === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
          <p className="font-display text-lg font-semibold text-neutral-900">No matches on this page</p>
          <p className="mt-2 text-sm text-neutral-500">
            Try the full free learning library or course catalog.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/learn?q=${encodeURIComponent(query.trim())}`}
              className="inline-flex h-11 min-h-[44px] items-center justify-center bg-brand px-5 text-sm font-semibold text-white"
            >
              Search free learning
            </Link>
            <Link
              href={`/browse?q=${encodeURIComponent(query.trim())}`}
              className="inline-flex h-11 min-h-[44px] items-center justify-center border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900"
            >
              Search courses
            </Link>
          </div>
        </div>
      ) : null}

      {filteredLibrary.length > 0 || (!searching && freeLibrary.length > 0) ? (
        <div>
          <HomepageSectionHeader
            id="free-learning"
            eyebrow="Free learning library"
            title="Free programs"
            description="Structured free learning paths you can start now — search any skill and pick a program that fits."
            actionHref={searching ? `/learn?q=${encodeURIComponent(query.trim())}` : "/learn"}
            actionLabel={
              freeLibraryTotal > freeLibrary.length
                ? `View all ${freeLibraryTotal.toLocaleString()} free programs`
                : "Browse free learning"
            }
          />
          <ul className="mt-8 grid list-none grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
            {(searching ? filteredLibrary : freeLibrary).map((path) => (
              <LearnPathCard key={path.slug} path={path} />
            ))}
          </ul>
          {!searching && freeLibraryTotal > freeLibrary.length ? (
            <div className="mt-8 flex justify-center">
              <Link
                href="/learn"
                className="inline-flex h-11 min-h-[44px] items-center justify-center border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 hover:border-neutral-500"
              >
                Browse all {freeLibraryTotal.toLocaleString()} free programs
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {filteredFree.length > 0 || (!searching && freeCourses.length > 0) ? (
        <div>
          <HomepageSectionHeader
            id="free-courses"
            eyebrow="No payment required"
            title="Free courses"
            description="Start learning for free with DigitalSkillX courses — enroll and begin immediately."
            actionHref="/browse?price=free"
            actionLabel="View free courses"
          />
          <HomepageCourseGrid courses={searching ? filteredFree : freeCourses} />
        </div>
      ) : null}

      {filteredPaid.length > 0 || (!searching && paidCourses.length > 0) ? (
        <div>
          <HomepageSectionHeader
            id="premium-courses"
            eyebrow="Go deeper"
            title="Premium courses"
            description="Practical programs designed to help you build and apply valuable digital skills."
            actionHref="/browse?price=paid"
            actionLabel="View all premium courses"
          />
          <div className="mt-8 grid min-w-0 grid-cols-1 gap-5 sm:mt-10 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
            {(searching ? filteredPaid : paidCourses).map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
          {!searching && hasMorePaid ? (
            <div className="mt-8 flex justify-center">
              <Link
                href="/browse?price=paid"
                className="inline-flex h-11 min-h-[44px] items-center justify-center border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900"
              >
                View all premium courses
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
