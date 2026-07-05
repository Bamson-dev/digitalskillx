"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CourseCard, type MarketplaceCourse } from "@/components/marketplace/course-card";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; slug: string | null };

export function BrowseCatalog({
  courses,
  categories,
  initialQuery = "",
  initialCategory = "",
}: {
  courses: MarketplaceCourse[];
  categories: Category[];
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses.filter((c) => {
      const matchesCategory =
        !category ||
        c.category_name?.toLowerCase() === category.toLowerCase() ||
        categories.find((cat) => cat.slug === category || cat.name === category)?.name ===
          c.category_name;
      if (!matchesCategory) return false;
      if (!q) return true;
      const haystack = [c.title, c.short_description, c.description, c.instructor_name, c.category_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [courses, query, category, categories]);

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses…"
            className="h-11 w-full rounded-lg border border-surface-border bg-white pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            aria-label="Search courses"
          />
        </div>
        <p className="shrink-0 text-sm text-neutral-500">
          {filtered.length} course{filtered.length === 1 ? "" : "s"}
        </p>
      </div>

      {categories.length > 0 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition min-h-[44px]",
              !category
                ? "border-brand bg-brand text-white"
                : "border-surface-border bg-white text-neutral-700 hover:border-neutral-300",
            )}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.name)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition min-h-[44px]",
                category === cat.name
                  ? "border-brand bg-brand text-white"
                  : "border-surface-border bg-white text-neutral-700 hover:border-neutral-300",
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-surface-border bg-surface-muted px-6 py-16 text-center">
          <p className="font-medium text-neutral-800">No courses match your search</p>
          <p className="mt-2 text-sm text-neutral-500">Try a different keyword or category.</p>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
