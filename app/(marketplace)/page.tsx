import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  fetchCourseCategories,
  fetchPublishedCourses,
  pickFeaturedCourse,
  type CatalogCourse,
} from "@/lib/published-courses";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseCard } from "@/components/marketplace/course-card";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { PriceDisplay } from "@/components/marketplace/price-display";
import { EnrollButton } from "@/components/marketplace/enroll-button";
import { HomepageCurrencyBar } from "@/components/marketplace/homepage-currency-bar";

export const metadata: Metadata = {
  title: "Learn Profitable Digital Skills",
  description: ORG.tagline,
};

export const dynamic = "force-dynamic";

const SECTION = "px-4 py-14 sm:px-8 sm:py-16";
const CONTAINER = "mx-auto w-full min-w-0 max-w-[1120px]";

async function fetchTrustStats() {
  try {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync();
    const [enrollmentsRes, certsRes] = await Promise.all([
      admin.from("enrollments").select("id", { count: "exact", head: true }),
      admin.from("certificates").select("id", { count: "exact", head: true }),
    ]);
    return {
      students: enrollmentsRes.count ?? 0,
      certificates: certsRes.count ?? 0,
    };
  } catch {
    return { students: 0, certificates: 0 };
  }
}

export default async function HomePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, email, role")
      .eq("id", user.id)
      .single();
    profile = data;
  }

  let courses: CatalogCourse[] = [];
  let categories: Awaited<ReturnType<typeof fetchCourseCategories>> = [];
  let trustStats = { students: 0, certificates: 0 };
  try {
    [courses, categories, trustStats] = await Promise.all([
      fetchPublishedCourses<CatalogCourse>(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon, created_at, category:course_categories(name)",
      ),
      fetchCourseCategories(),
      fetchTrustStats(),
    ]);
  } catch (err) {
    console.error("[HomePage] catalog fetch failed", err);
  }

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));
  const featured = pickFeaturedCourse(catalog);
  const realCategories = (categories ?? []).slice(0, 6);

  let featuredEnrolled = false;
  if (user && featured) {
    const { data: fe } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", featured.id)
      .maybeSingle();
    featuredEnrolled = Boolean(fe);
  }

  const trustItems = [
    { label: "Programs", value: catalog.length },
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
                Practical programs from people who build and sell online. Learn at your pace. Apply
                what you learn.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/browse"
                  className="inline-flex h-12 min-h-[48px] items-center justify-center bg-brand px-8 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Explore courses
                </Link>
                {!user ? (
                  <Link
                    href="/register"
                    className="inline-flex h-12 min-h-[48px] items-center justify-center px-1 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
                  >
                    Create free account
                  </Link>
                ) : (
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 min-h-[48px] items-center justify-center px-1 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
                  >
                    Continue learning
                  </Link>
                )}
              </div>
            </div>
          </div>

          {featured ? (
            <div className="border-t border-neutral-200">
              <Link href={`/course/${featured.id}`} className="group block w-full">
                <div className="relative aspect-[21/9] min-h-[200px] w-full bg-neutral-100 sm:min-h-[260px] lg:aspect-[2.4/1] lg:min-h-[320px]">
                  {featured.thumbnail_url ? (
                    <Image
                      src={featured.thumbnail_url}
                      alt={featured.title}
                      fill
                      className="object-cover"
                      priority
                      sizes="100vw"
                    />
                  ) : (
                    <CourseThumbnailPlaceholder title={featured.title} size="hero" />
                  )}
                </div>
              </Link>
              <div className={`${CONTAINER} flex flex-wrap items-end justify-between gap-4 px-4 py-5 sm:px-8`}>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
                    Featured program
                  </p>
                  <Link
                    href={`/course/${featured.id}`}
                    className="mt-1 block font-display text-lg font-bold text-neutral-950 hover:text-brand sm:text-xl"
                  >
                    {featured.title}
                  </Link>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-display text-lg font-bold tabular-nums text-brand">
                    <PriceDisplay course={featured} />
                  </span>
                  <Link
                    href={`/course/${featured.id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-neutral-800 hover:text-brand"
                  >
                    View
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {trustItems.length > 0 ? (
          <section className="border-b border-neutral-200">
            <div className={`${CONTAINER} flex flex-wrap items-baseline gap-x-10 gap-y-3 px-4 py-8 sm:px-8`}>
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
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-brand" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {featured ? (
          <section className="bg-neutral-950 text-white">
            <div className={`${SECTION} ${CONTAINER}`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                Start here
              </p>
              <div className="mt-8 grid min-w-0 gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
                <div className="relative aspect-[4/3] w-full min-w-0 overflow-hidden bg-neutral-800">
                  {featured.thumbnail_url ? (
                    <Image
                      src={featured.thumbnail_url}
                      alt={featured.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  ) : (
                    <CourseThumbnailPlaceholder title={featured.title} size="hero" />
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl">
                    {featured.title}
                  </h2>
                  {featured.instructor_name ? (
                    <p className="mt-3 text-sm text-neutral-400">{featured.instructor_name}</p>
                  ) : null}
                  {(featured.short_description ?? featured.description) ? (
                    <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-300">
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
                      isLoggedIn={Boolean(user)}
                      comingSoon={Boolean(featured.is_coming_soon)}
                      className="sm:max-w-[220px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section id="courses" className={`bg-white ${SECTION}`}>
          <div className={CONTAINER}>
            <HomepageCurrencyBar sticky />

            <div className="mt-6 flex items-end justify-between gap-6">
              <div>
                <h2 className="font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
                  Course catalog
                </h2>
                <p className="mt-2 text-sm text-neutral-500">
                  {catalog.length > 0
                    ? `${catalog.length} published program${catalog.length === 1 ? "" : "s"}.`
                    : "New programs launching soon."}
                </p>
              </div>
              <Link
                href="/browse"
                className="shrink-0 text-sm font-medium text-neutral-600 hover:text-brand"
              >
                Browse all
              </Link>
            </div>

            {catalog.length === 0 ? (
              <p className="mt-12 text-sm text-neutral-500">Check back shortly for new courses.</p>
            ) : (
              <div className="mt-10 grid min-w-0 grid-cols-1 gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="border-t border-neutral-200 bg-neutral-50">
          <div className={`${SECTION} ${CONTAINER} text-center`}>
            <h2 className="font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
              Ready to start learning?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-neutral-600">
              Browse the full catalog or create a free account to save progress and earn certificates.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/browse"
                className="inline-flex h-12 min-h-[48px] w-full items-center justify-center bg-brand px-8 text-sm font-semibold text-white hover:bg-brand-700 sm:w-auto"
              >
                Browse all courses
              </Link>
              {!user ? (
                <Link
                  href="/register"
                  className="inline-flex h-12 min-h-[48px] w-full items-center justify-center border border-neutral-300 bg-white px-8 text-sm font-semibold text-neutral-900 hover:border-neutral-500 sm:w-auto"
                >
                  Create free account
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 min-h-[48px] w-full items-center justify-center border border-neutral-300 bg-white px-8 text-sm font-semibold text-neutral-900 hover:border-neutral-500 sm:w-auto"
                >
                  Go to dashboard
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
