import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseMediaImage } from "@/components/marketplace/course-media-image";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { EnrollButton } from "@/components/marketplace/enroll-button";
import { HomepageCurrencyBar } from "@/components/marketplace/homepage-currency-bar";
import { HomepageProgramSearch } from "@/components/marketplace/homepage-program-search";
import { isCatalogCourseFree } from "@/lib/currency";
import { partitionHomepageCatalog } from "@/lib/homepage-catalog";
import {
  getCachedCourseCategories,
  getCachedPublishedCatalog,
  getCachedStorefrontTrustStats,
} from "@/lib/storefront-catalog-cache";
import { getCachedHomepageFreeLibrary } from "@/lib/content-factory/library-cache";
import { contentFactoryEnabled } from "@/lib/content-factory/feature-flag";
import { withTimeout } from "@/lib/with-timeout";

export const metadata: Metadata = {
  title: "Free & Premium Digital Skills Courses",
  description:
    "Learn practical digital skills on DigitalSkillX — start with free courses or go deeper with premium programs. Learn at your pace and apply what you build.",
};

/**
 * Always render against the live Contabo catalog.
 * ISR/build-time generation was baking an empty course list into the HTML when
 * Kong was unreachable during `next build`, which hid free/paid sections in prod.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Catalog needs more headroom than trust stats — never let a slow count wipe courses. */
const HOME_CATALOG_TIMEOUT_MS = 12_000;
const HOME_SECONDARY_TIMEOUT_MS = 4_000;

const SECTION = "px-4 py-14 sm:px-8 sm:py-16";
const CONTAINER = "mx-auto w-full min-w-0 max-w-[1120px]";

export default async function HomePage() {
  const learnEnabled = contentFactoryEnabled();
  const [courses, categories, trustStats, freeLibraryResult] = await Promise.all([
    withTimeout(
      getCachedPublishedCatalog(),
      HOME_CATALOG_TIMEOUT_MS,
      [] as Awaited<ReturnType<typeof getCachedPublishedCatalog>>,
    ),
    withTimeout(
      getCachedCourseCategories(),
      HOME_SECONDARY_TIMEOUT_MS,
      [] as Awaited<ReturnType<typeof getCachedCourseCategories>>,
    ),
    withTimeout(getCachedStorefrontTrustStats(), HOME_SECONDARY_TIMEOUT_MS, {
      students: 0,
      certificates: 0,
    }),
    learnEnabled
      ? withTimeout(getCachedHomepageFreeLibrary(), HOME_CATALOG_TIMEOUT_MS, {
          paths: [],
          page: 1,
          pageSize: 48,
          total: 0,
          params: {
            q: "",
            category: "all",
            page: 1,
            difficulty: null,
            duration: null,
            certificate: "any",
            sort: "newest",
          },
        } as Awaited<ReturnType<typeof getCachedHomepageFreeLibrary>>)
      : Promise.resolve(null),
  ]);

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));
  const { featured, free, paid, freePreview, paidPreview, hasMorePaid } =
    partitionHomepageCatalog(catalog);
  const freeLibraryPaths = (freeLibraryResult?.paths ?? []).map((path) => ({
    slug: path.slug,
    title: path.title,
    short_description: path.short_description,
    category: path.category,
    difficulty: path.difficulty,
    artwork_public_url: path.artwork_public_url,
    artwork_storage_path: path.artwork_storage_path,
    artwork_status: path.artwork_status,
    creator_name: path.creator_name ?? null,
    estimated_duration_seconds: path.estimated_duration_seconds,
    certificate_enabled: path.certificate_enabled,
  }));
  const freeLibraryTotal = freeLibraryResult?.total ?? freeLibraryPaths.length;
  const realCategories = (categories ?? []).slice(0, 6);
  // Anonymous SSR shell — logged-in nav/enrollment hydrate without blocking TTFB.
  const profile = null;
  const featuredEnrolled = false;
  const featuredIsFree = featured ? isCatalogCourseFree(featured) : false;

  const trustItems = [
    { label: "Programs", value: catalog.length + freeLibraryTotal },
    { label: "Free courses", value: free.length },
    { label: "Free learning paths", value: freeLibraryTotal },
    { label: "Students", value: trustStats.students },
    { label: "Certificates issued", value: trustStats.certificates },
  ].filter((item) => item.value > 0);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={profile} hideCurrencyToggle />

      <main className="flex-1 overflow-x-hidden">
        {/* Hero — brand first, one job */}
        <section className="border-b border-neutral-200">
          <div className={SECTION}>
            <div className={CONTAINER}>
              <p className="font-display text-sm font-semibold tracking-tight text-brand sm:text-base">
                DigitalSkillX
              </p>
              <h1 className="mt-4 max-w-3xl font-display text-[2.35rem] font-bold leading-[1.05] tracking-tight text-neutral-950 sm:text-5xl lg:text-[3.5rem]">
                Master profitable digital skills
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Practical programs from people who build and sell online. Start with free courses, or
                go deeper with premium programs — learn at your pace and apply what you learn.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="#courses"
                  className="inline-flex h-12 min-h-[48px] items-center justify-center bg-brand px-8 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Explore courses
                </Link>
                <Link
                  href={freeLibraryPaths.length > 0 ? "#free-learning" : free.length > 0 ? "#free-courses" : "/learn"}
                  className="inline-flex h-12 min-h-[48px] items-center justify-center border border-neutral-300 bg-white px-8 text-sm font-semibold text-neutral-900 transition hover:border-neutral-500"
                >
                  Start learning free
                </Link>
              </div>
            </div>
          </div>

          {featured ? (
            <div className="border-t border-neutral-200">
              <Link href={`/course/${featured.id}`} className="group block w-full overflow-hidden">
                <CourseMediaImage
                  src={featured.thumbnail_url}
                  alt={featured.title}
                  title={featured.title}
                  aspect="hero"
                  priority
                  sizes="100vw"
                  placeholderSize="hero"
                />
              </Link>
              <div
                className={`${CONTAINER} flex flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-8`}
              >
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Featured program
                    {featuredIsFree ? " · Free" : " · Premium"}
                  </p>
                  <Link
                    href={`/course/${featured.id}`}
                    className="mt-1 block font-display text-lg font-bold text-neutral-950 hover:text-brand sm:text-xl"
                  >
                    {featured.title}
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <span className="font-display text-lg font-bold tabular-nums text-brand">
                    <PriceDisplay course={featured} />
                  </span>
                  <Link
                    href={`/course/${featured.id}`}
                    className="inline-flex h-10 min-h-[44px] items-center gap-1 bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-700"
                  >
                    {featuredIsFree ? "Start free" : "View course"}
                    <ArrowUpRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {trustItems.length > 0 ? (
          <section className="border-b border-neutral-200" aria-label="Platform stats">
            <div
              className={`${CONTAINER} flex flex-wrap items-baseline gap-x-10 gap-y-3 px-4 py-8 sm:px-8`}
            >
              {trustItems.map(({ label, value }) => (
                <p key={label} className="text-sm text-neutral-600">
                  <span className="font-display text-xl font-bold tabular-nums text-neutral-950">
                    {value.toLocaleString()}
                  </span>{" "}
                  {label}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {realCategories.length > 0 ? (
          <section className={`bg-white ${SECTION}`}>
            <div className={CONTAINER}>
              <div className="flex items-end justify-between gap-6">
                <div>
                  <h2 className="font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
                    Browse by topic
                  </h2>
                  <p className="mt-2 text-sm text-neutral-500">
                    Jump straight into the skill you want to build.
                  </p>
                </div>
                <Link
                  href="/browse"
                  className="hidden shrink-0 text-sm font-medium text-neutral-600 hover:text-brand sm:inline-flex"
                >
                  All courses
                </Link>
              </div>
              <ul className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
                {realCategories.map((cat, i) => (
                  <li key={cat.id}>
                    <Link
                      href={`/browse?category=${encodeURIComponent(cat.name)}`}
                      className="group flex min-h-[56px] items-center justify-between py-4 sm:min-h-[60px]"
                    >
                      <span className="flex min-w-0 items-baseline gap-4">
                        <span className="shrink-0 font-display text-sm tabular-nums text-neutral-400">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="font-display text-lg font-semibold text-neutral-900 group-hover:text-brand sm:text-xl">
                          {cat.name}
                        </span>
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-brand"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {featured ? (
          <section className="bg-neutral-950 text-white" aria-labelledby="featured-heading">
            <div className={`${SECTION} ${CONTAINER}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Start here
              </p>
              <div className="mt-8 grid min-w-0 gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
                <div className="min-w-0 overflow-hidden rounded-xl bg-neutral-900">
                  <CourseMediaImage
                    src={featured.thumbnail_url}
                    alt={featured.title}
                    title={featured.title}
                    aspect="video"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    placeholderSize="hero"
                    frameClassName="rounded-xl"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">
                    {featuredIsFree ? "Free course" : "Premium course"}
                  </p>
                  <h2
                    id="featured-heading"
                    className="mt-3 font-display text-3xl font-bold leading-tight sm:text-4xl"
                  >
                    {featured.title}
                  </h2>
                  {featured.instructor_name ? (
                    <p className="mt-3 text-sm text-neutral-400">{featured.instructor_name}</p>
                  ) : null}
                  {(featured.short_description ?? featured.description) ? (
                    <p className="mt-5 max-w-md line-clamp-4 text-[15px] leading-relaxed text-neutral-300">
                      {featured.short_description ?? featured.description}
                    </p>
                  ) : null}
                  <div className="mt-8 flex flex-col gap-5 border-t border-neutral-800 pt-8">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <p className="font-display text-3xl font-bold tabular-nums text-brand">
                        <PriceDisplay course={featured} />
                      </p>
                      <HomepageCurrencyBar compact className="w-auto" />
                    </div>
                    <EnrollButton
                      courseId={featured.id}
                      priceNgn={featured.price_ngn}
                      priceUsd={featured.price_usd}
                      isEnrolled={featuredEnrolled}
                      isLoggedIn={Boolean(profile)}
                      comingSoon={Boolean(featured.is_coming_soon)}
                      className="sm:max-w-[220px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section id="courses" className={`scroll-mt-20 bg-white ${SECTION}`}>
          <div className={CONTAINER}>
            <HomepageCurrencyBar sticky />

            <div className="mt-6">
              <h2 className="font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
                Courses &amp; programs
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-neutral-500 sm:text-[15px]">
                {catalog.length + freeLibraryTotal > 0
                  ? `Search free learning paths and premium courses — ${ORG.platformName} has programs you can start today.`
                  : "New programs launching soon."}
              </p>
            </div>

            {catalog.length === 0 && freeLibraryPaths.length === 0 ? (
              <div className="mt-12 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
                <p className="font-display text-lg font-semibold text-neutral-900">
                  Courses launching soon
                </p>
                <p className="mt-2 text-sm text-neutral-500">Check back shortly for new programs.</p>
              </div>
            ) : (
              <HomepageProgramSearch
                freeCourses={freePreview}
                paidCourses={paidPreview}
                freeLibrary={freeLibraryPaths}
                freeLibraryTotal={freeLibraryTotal}
                hasMorePaid={hasMorePaid}
              />
            )}
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className={`${SECTION} ${CONTAINER} text-center`}>
            <h2 className="font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
              Ready to start learning?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-neutral-600">
              Browse free learning programs, explore premium courses, or create an account to save
              progress and earn certificates.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/learn"
                className="inline-flex h-12 min-h-[48px] w-full items-center justify-center bg-brand px-8 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
              >
                Browse free learning
              </Link>
              <Link
                href="/browse"
                className="inline-flex h-12 min-h-[48px] w-full items-center justify-center border border-neutral-300 bg-white px-8 text-sm font-semibold text-neutral-900 hover:border-neutral-500 sm:w-auto"
              >
                Browse all courses
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
