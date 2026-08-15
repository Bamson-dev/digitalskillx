import type { Metadata } from "next";
import Link from "next/link";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { getCachedPublishedLibrary, libraryCacheKey } from "@/lib/content-factory/library-cache";
import {
  LIBRARY_CATEGORIES,
  libraryCategoryLabel,
  libraryHref,
  parseLibraryCategory,
  parseLibraryPage,
  sanitizeLibraryQuery,
} from "@/lib/content-factory/library-shared";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { siteUrl } from "@/lib/org";

export const revalidate = 300;

type Search = { q?: string; category?: string; page?: string };

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const q = sanitizeLibraryQuery(searchParams.q);
  const category = parseLibraryCategory(searchParams.category);
  const page = parseLibraryPage(searchParams.page);
  const categoryLabel = libraryCategoryLabel(category);
  const title = q
    ? `Search free learning: ${q}`
    : category === "all"
      ? page > 1
        ? `Free Learning Library · Page ${page}`
        : "Free Learning Library"
      : page > 1
        ? `${categoryLabel} · Free Learning · Page ${page}`
        : `${categoryLabel} · Free Learning Library`;
  const canonical =
    !q && category !== "all" && page <= 1
      ? `${siteUrl()}/learn/${category}`
      : `${siteUrl()}${libraryHref({
          category: q ? undefined : category === "all" ? undefined : category,
          page: q ? undefined : page,
        })}`;
  return {
    title,
    description:
      "Learn profitable skills for free. DigitalSkillX organizes public YouTube lessons into structured learning paths with clear creator credit.",
    alternates: { canonical },
    robots: q || page > 1 || category !== "all" ? { index: false, follow: true } : undefined,
    openGraph: {
      title: "Learn profitable skills for free",
      description:
        "Structured free learning paths from public educational YouTube content. Watch the original videos. Creators keep the credit.",
      url: `${siteUrl()}/learn`,
    },
  };
}

export default async function LearnIndexPage({ searchParams }: { searchParams: Search }) {
  if (!contentFactoryEnabled()) {
    return (
      <div className="marketplace">
        <MarketplaceNav user={null} hideCurrencyToggle />
        <div className="mx-auto max-w-3xl px-4 py-16">
          <h1 className="text-3xl font-bold">Free Learning</h1>
          <p className="mt-3 text-neutral-600">The Free Learning Library is not enabled yet.</p>
          <Link href="/" className="mt-6 inline-block text-brand hover:underline">
            Back home
          </Link>
        </div>
        <MarketplaceFooter />
      </div>
    );
  }

  const key = libraryCacheKey(searchParams);
  let result: Awaited<ReturnType<typeof getCachedPublishedLibrary>> = {
    paths: [],
    page: 1,
    pageSize: 20,
    total: 0,
    category: "all",
    q: "",
  };
  try {
    result = await getCachedPublishedLibrary(key.q, key.category, key.page);
  } catch {
    result = { ...result, q: key.q, category: key.category };
  }

  const { paths, page, pageSize, total, category, q } = result;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasQuery = Boolean(q);
  const emptyMessage = hasQuery
    ? "No learning paths match your search."
    : category !== "all"
      ? `No published ${libraryCategoryLabel(category).toLowerCase()} paths yet.`
      : "No published learning paths yet.";

  return (
    <div className="marketplace min-w-0 overflow-x-hidden">
      <MarketplaceNav user={null} hideCurrencyToggle />
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-8">
        <header className="max-w-2xl">
          <p className="text-sm font-medium text-brand">Free Learning Library</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Learn profitable skills for free
          </h1>
          <p className="mt-3 text-neutral-600">
            DigitalSkillX organizes public educational YouTube videos into structured learning paths.
            Watch the original lessons, learn at your pace, and keep going if you later want a deeper
            paid course. Creators keep full credit. We do not claim ownership or partnership.
          </p>
        </header>

        <form action="/learn" method="get" className="mt-8 max-w-xl" role="search">
          <label htmlFor="learn-q" className="sr-only">
            Search learning paths
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="learn-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search title, creator, topic, or description"
              className="h-11 min-w-0 flex-1 rounded-xl border border-app bg-white px-3 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {category !== "all" ? <input type="hidden" name="category" value={category} /> : null}
            <button
              type="submit"
              className="h-11 shrink-0 rounded-xl bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Search
            </button>
          </div>
        </form>

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Learning categories">
          {LIBRARY_CATEGORIES.map((item) => {
            const href = libraryHref({ q, category: item.id, page: 1 });
            const active = category === item.id;
            return (
              <Link
                key={item.id}
                href={href}
                className={`rounded-full border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                  active
                    ? "border-brand bg-brand text-white"
                    : "border-app bg-white text-neutral-700 hover:border-brand"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {hasQuery ? (
          <p className="mt-4 text-sm text-muted">
            Showing results for “{q}”{category !== "all" ? ` in ${libraryCategoryLabel(category)}` : ""}.
          </p>
        ) : null}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <Link
              key={path.id}
              href={`/learn/${path.slug}`}
              className="group min-w-0 overflow-hidden rounded-2xl border border-app bg-white transition hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <div className="aspect-[16/10] bg-neutral-100">
                {path.artwork_public_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={path.artwork_public_url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">
                    {path.category || "Free learning path"}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-4">
                <p className="text-xs uppercase tracking-wide text-muted">{path.category || "Skills"}</p>
                <h2 className="font-semibold group-hover:text-brand">{path.title}</h2>
                {path.creator_name ? (
                  <p className="text-sm text-neutral-700">Learn from {path.creator_name}</p>
                ) : null}
                <p className="line-clamp-2 text-sm text-neutral-600">{path.short_description}</p>
              </div>
            </Link>
          ))}
        </div>

        {!paths.length ? <p className="mt-10 text-sm text-muted">{emptyMessage}</p> : null}

        {totalPages > 1 ? (
          <nav className="mt-10 flex flex-wrap items-center gap-2" aria-label="Pagination">
            {page > 1 ? (
              <Link
                href={libraryHref({ q, category, page: page - 1 })}
                className="rounded-lg border border-app px-3 py-2 text-sm hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                rel="prev"
              >
                Previous
              </Link>
            ) : null}
            <p className="text-sm text-muted">
              Page {page} of {totalPages}
            </p>
            {page < totalPages ? (
              <Link
                href={libraryHref({ q, category, page: page + 1 })}
                className="rounded-lg border border-app px-3 py-2 text-sm hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                rel="next"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </div>
      <MarketplaceFooter />
    </div>
  );
}
