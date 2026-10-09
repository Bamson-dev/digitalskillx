import type { Metadata } from "next";
import Link from "next/link";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { getCachedPublishedLibrary, libraryCacheKey } from "@/lib/content-factory/library-cache";
import { libraryCategoryLabel, LIBRARY_CATEGORIES } from "@/lib/content-factory/library-shared";
import { learnDiscoveryHref, parseLearnDiscoverySearchParams } from "@/lib/learn-discovery/discovery-shared";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { LearnDiscoveryToolbar } from "@/components/learn/learn-discovery-toolbar";
import { LearnPathCard } from "@/components/learn/learn-path-card";
import { siteUrl } from "@/lib/org";

export const revalidate = 300;

type Search = {
  q?: string;
  category?: string;
  page?: string;
  difficulty?: string;
  duration?: string;
  certificate?: string;
  sort?: string;
};

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const params = parseLearnDiscoverySearchParams(searchParams);
  const categoryLabel = libraryCategoryLabel(params.category);
  const title = params.q
    ? `Search free learning: ${params.q}`
    : params.category === "all"
      ? params.page > 1
        ? `Free Learning Library · Page ${params.page}`
        : "Free Learning Library"
      : params.page > 1
        ? `${categoryLabel} · Free Learning · Page ${params.page}`
        : `${categoryLabel} · Free Learning Library`;
  const canonical =
    !params.q && params.category !== "all" && params.page <= 1
      ? `${siteUrl()}/learn/${params.category}`
      : `${siteUrl()}${learnDiscoveryHref({
          category: params.q ? undefined : params.category === "all" ? undefined : params.category,
          page: params.q ? undefined : params.page,
        })}`;
  return {
    title,
    description:
      "Learn profitable skills for free. DigitalSkillX organizes public YouTube lessons into structured learning paths with clear creator credit.",
    alternates: { canonical },
    robots:
      params.q || params.page > 1 || params.category !== "all" || params.difficulty || params.duration
        ? { index: false, follow: true }
        : undefined,
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
  const discoveryParams = parseLearnDiscoverySearchParams(searchParams);
  let result: Awaited<ReturnType<typeof getCachedPublishedLibrary>> = {
    paths: [],
    page: 1,
    pageSize: 20,
    total: 0,
    category: discoveryParams.category,
    q: discoveryParams.q,
    params: discoveryParams,
  };
  try {
    result = await getCachedPublishedLibrary(
      key.q,
      key.category,
      key.page,
      key.difficulty,
      key.duration,
      key.certificate,
      key.sort,
    );
  } catch {
    result = { ...result, params: discoveryParams };
  }

  const { paths, page, pageSize, total } = result;
  const params = result.params ?? discoveryParams;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasQuery = Boolean(params.q);
  const emptyMessage = hasQuery
    ? "No learning paths match your search and filters."
    : params.category !== "all"
      ? `No published ${libraryCategoryLabel(params.category).toLowerCase()} paths yet.`
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

        <LearnDiscoveryToolbar initial={params} total={total} />

        <nav className="mt-6 flex flex-wrap gap-2" aria-label="Learning categories">
          {LIBRARY_CATEGORIES.map((item) => {
            const href = learnDiscoveryHref({
              q: params.q,
              category: item.id,
              difficulty: params.difficulty,
              duration: params.duration,
              certificate: params.certificate,
              sort: params.sort,
              page: 1,
            });
            const active = params.category === item.id;
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
            Showing results for “{params.q}”
            {params.category !== "all" ? ` in ${libraryCategoryLabel(params.category)}` : ""}.
          </p>
        ) : null}

        <ul className="mt-8 grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {paths.map((path) => (
            <LearnPathCard key={path.id} path={path} />
          ))}
        </ul>

        {!paths.length ? <p className="mt-10 text-sm text-muted">{emptyMessage}</p> : null}

        {totalPages > 1 ? (
          <nav className="mt-10 flex flex-wrap items-center gap-2" aria-label="Pagination">
            {page > 1 ? (
              <Link
                href={learnDiscoveryHref({ ...params, page: page - 1 })}
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
                href={learnDiscoveryHref({ ...params, page: page + 1 })}
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
