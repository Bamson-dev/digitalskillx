"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { CourseCard, type MarketplaceCourse } from "@/components/marketplace/course-card";
import { isCatalogCourseFree } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string; slug: string | null };
type SortKey = "newest" | "price-asc" | "price-desc" | "title";
type PriceFilter = "" | "free" | "paid";

function normalizePriceFilter(value: string | undefined): PriceFilter {
  if (value === "free" || value === "paid") return value;
  return "";
}

export function BrowseCatalog({
  courses,
  categories,
  initialQuery = "",
  initialCategory = "",
  initialPrice = "",
}: {
  courses: MarketplaceCourse[];
  categories: Category[];
  initialQuery?: string;
  initialCategory?: string;
  initialPrice?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [price, setPrice] = useState<PriceFilter>(normalizePriceFilter(initialPrice));
  const [sort, setSort] = useState<SortKey>("newest");

  const syncPriceToUrl = useCallback(
    (next: PriceFilter) => {
      setPrice(next);
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (category) params.set("category", category);
      if (next) params.set("price", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [category, pathname, query, router],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = courses.filter((c) => {
      const matchesCategory =
        !category ||
        c.category_name?.toLowerCase() === category.toLowerCase() ||
        categories.find((cat) => cat.slug === category || cat.name === category)?.name ===
          c.category_name;
      if (!matchesCategory) return false;

      if (price === "free" && !isCatalogCourseFree(c)) return false;
      if (price === "paid" && isCatalogCourseFree(c)) return false;

      if (!q) return true;
      const haystack = [c.title, c.short_description, c.description, c.instructor_name, c.category_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "price-asc":
          return (a.price_ngn ?? 0) - (b.price_ngn ?? 0);
        case "price-desc":
          return (b.price_ngn ?? 0) - (a.price_ngn ?? 0);
        case "title":
          return a.title.localeCompare(b.title);
        case "newest":
          return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
        default:
          return 0;
      }
    });
    return sorted;
  }, [courses, query, category, categories, price, sort]);

  const priceFilters: { id: PriceFilter; label: string }[] = [
    { id: "", label: "All" },
    { id: "free", label: "Free" },
    { id: "paid", label: "Paid" },
  ];

  return (
    <div className="overflow-x-hidden">
      <div className="flex flex-col gap-5 border-b border-neutral-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search courses"
            className="h-11 w-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none"
            aria-label="Search courses"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="sr-only sm:not-sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-11 border border-neutral-200 bg-white px-3 text-sm text-neutral-800 focus:border-neutral-400 focus:outline-none"
              aria-label="Sort courses"
            >
              <option value="newest">Newest</option>
              <option value="title">Title A–Z</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
            </select>
          </label>
          <p className="shrink-0 text-sm tabular-nums text-neutral-500">
            {filtered.length} course{filtered.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Filter by price">
        {priceFilters.map((item) => (
          <button
            key={item.id || "all-price"}
            type="button"
            onClick={() => syncPriceToUrl(item.id)}
            className={cn(
              "min-h-[44px] shrink-0 border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition",
              price === item.id
                ? "border-brand bg-brand text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400",
            )}
            aria-pressed={price === item.id}
          >
            {item.label}
          </button>
        ))}
      </div>

      {categories.length > 0 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={cn(
              "min-h-[44px] shrink-0 border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition",
              !category
                ? "border-neutral-950 bg-neutral-950 text-white"
                : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400",
            )}
          >
            All topics
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.name)}
              className={cn(
                "min-h-[44px] shrink-0 border px-3.5 py-2 text-xs font-semibold uppercase tracking-wider transition",
                category === cat.name
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400",
              )}
            >
              {cat.name}
            </button>
          ))}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <div className="mt-16 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-16 text-center">
          <p className="font-display text-lg font-semibold text-neutral-800">No courses match</p>
          <p className="mt-2 text-sm text-neutral-500">Try a different keyword, price filter, or topic.</p>
        </div>
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 lg:gap-7">
          {filtered.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
