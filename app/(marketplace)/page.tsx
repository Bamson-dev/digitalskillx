import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { fetchCourseCategories, fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
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

const SECTION = "px-4 py-16 sm:px-8";
const CONTAINER = "mx-auto w-full min-w-0 max-w-[1200px]";

async function fetchTrustStats() {
  try {
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync();
    const [coursesRes, enrollmentsRes, certsRes] = await Promise.all([
      admin
        .from("courses")
        .select("id", { count: "exact", head: true })
        .eq("visibility", "published"),
      admin.from("enrollments").select("id", { count: "exact", head: true }),
      admin.from("certificates").select("id", { count: "exact", head: true }),
    ]);
    return {
      courses: coursesRes.count ?? 0,
      students: enrollmentsRes.count ?? 0,
      certificates: certsRes.count ?? 0,
    };
  } catch {
    return { courses: 0, students: 0, certificates: 0 };
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

  const [courses, categories, trustStats] = await Promise.all([
    fetchPublishedCourses<CatalogCourse>(
      "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon, created_at, category:course_categories(name)",
    ),
    fetchCourseCategories(),
    fetchTrustStats(),
  ]);

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));
  const featured = catalog[0] ?? null;

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

  const displayCategories =
    (categories ?? []).length > 0
      ? (categories ?? []).slice(0, 4)
      : [
          { id: "1", name: "Paid Ads", slug: "paid-ads" },
          { id: "2", name: "Sales & Funnels", slug: "sales" },
          { id: "3", name: "E-Commerce", slug: "ecommerce" },
          { id: "4", name: "Copywriting", slug: "copywriting" },
        ];

  const categoryTags =
    (categories ?? []).length > 0
      ? (categories ?? []).slice(0, 3).map((c) => c.name)
      : ["Marketing", "Sales", "Ads"];

  const trustItems = [
    { label: "Courses", value: trustStats.courses },
    { label: "Students", value: trustStats.students },
    { label: "Certificates", value: trustStats.certificates },
  ].filter((item) => item.value > 0);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={profile} hideCurrencyToggle />

      <main className="flex-1 overflow-x-hidden">
        {/* Hero */}
        <section className={`bg-white ${SECTION}`}>
          <div className={CONTAINER}>
            <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[1fr_400px] lg:gap-12 xl:grid-cols-[1fr_420px]">
              <div className="min-w-0 max-w-xl lg:max-w-none">
                <h1 className="font-display text-[2.25rem] font-bold leading-[1.05] text-neutral-950 sm:text-5xl lg:text-[3.25rem] xl:text-[3.75rem]">
                  Master profitable digital skills
                </h1>
                <p className="mt-5 max-w-md text-base leading-relaxed text-neutral-500 sm:text-[17px]">
                  Learn from practitioners who&apos;ve built real businesses. Practical programs you can
                  apply immediately.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {categoryTags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/browse?category=${encodeURIComponent(tag)}`}
                      className="inline-flex min-h-[36px] items-center border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-neutral-950 hover:text-neutral-950"
                    >
                      {tag}
                    </Link>
                  ))}
                </div>
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
                      className="inline-flex h-12 min-h-[48px] items-center justify-center px-2 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
                    >
                      Create free account
                    </Link>
                  ) : (
                    <Link
                      href="/dashboard"
                      className="inline-flex h-12 min-h-[48px] items-center justify-center px-2 text-sm font-medium text-neutral-600 underline-offset-4 hover:text-neutral-950 hover:underline"
                    >
                      Go to dashboard
                    </Link>
                  )}
                </div>
              </div>

              {featured ? (
                <Link
                  href={`/course/${featured.id}`}
                  className="group block w-full min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-xl bg-neutral-100">
                    {featured.thumbnail_url ? (
                      <Image
                        src={featured.thumbnail_url}
                        alt={featured.title}
                        fill
                        className="object-cover"
                        priority
                        sizes="(max-width: 1024px) 100vw, 420px"
                      />
                    ) : (
                      <CourseThumbnailPlaceholder title={featured.title} size="hero" />
                    )}
                  </div>
                  <div className="rounded-b-xl border-t border-neutral-200 bg-neutral-950 px-4 py-4 text-white sm:px-5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                      Featured
                    </p>
                    <p className="mt-1 line-clamp-2 font-display text-lg font-bold leading-snug">
                      {featured.title}
                    </p>
                    <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-display text-xl font-bold tabular-nums text-brand">
                        <PriceDisplay course={featured} />
                      </span>
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-400 transition group-hover:text-white" />
                    </div>
                    <div className="mt-3 border-t border-neutral-800 pt-3">
                      <HomepageCurrencyBar compact />
                    </div>
                  </div>
                </Link>
              ) : (
                <div className="w-full min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-neutral-100">
                  <div className="relative aspect-[4/3] w-full">
                    <CourseThumbnailPlaceholder title="Digital Skills Training" size="hero" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Trust stats */}
        {trustItems.length > 0 ? (
          <section className={`border-y border-neutral-200 bg-neutral-50 ${SECTION}`}>
            <div className={CONTAINER}>
              <p className="text-sm text-neutral-500">DigitalSkillX so far</p>
              <div className="mt-5 flex flex-wrap items-baseline gap-x-8 gap-y-4 sm:gap-x-12">
                {trustItems.map(({ label, value }) => (
                  <div key={label} className="flex items-baseline gap-2.5">
                    <span className="font-display text-2xl font-bold tabular-nums text-neutral-950 sm:text-3xl">
                      {value.toLocaleString()}
                    </span>
                    <span className="text-sm text-neutral-500">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Categories */}
        <section className={`bg-white ${SECTION}`}>
          <div className={CONTAINER}>
            <div className="flex items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Categories
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
                  Explore by topic
                </h2>
              </div>
              <Link
                href="/browse"
                className="hidden shrink-0 text-sm font-medium text-neutral-500 hover:text-brand sm:inline-flex"
              >
                View all
              </Link>
            </div>
            <ul className="mt-10 divide-y divide-neutral-200 border-y border-neutral-200">
              {displayCategories.map((cat, i) => (
                <li key={cat.id}>
                  <Link
                    href={`/browse?category=${encodeURIComponent(cat.name)}`}
                    className="group flex min-h-[56px] items-center justify-between py-4 transition hover:pl-1 sm:min-h-[64px] sm:py-5"
                  >
                    <span className="flex min-w-0 items-baseline gap-4">
                      <span className="shrink-0 font-display text-sm tabular-nums text-neutral-300">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display text-lg font-semibold text-neutral-900 group-hover:text-brand sm:text-xl">
                        {cat.name}
                      </span>
                    </span>
                    <ArrowUpRight className="h-4 w-4 shrink-0 text-neutral-300 transition group-hover:text-brand" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/browse" className="mt-6 inline-flex text-sm font-medium text-brand sm:hidden">
              View all categories →
            </Link>
          </div>
        </section>

        {/* Flagship */}
        {featured ? (
          <section className={`bg-neutral-950 text-white ${SECTION}`}>
            <div className={CONTAINER}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Flagship program
              </p>
              <div className="mt-8 grid min-w-0 gap-10 lg:grid-cols-2 lg:items-end lg:gap-12">
                <div className="relative min-h-[220px] w-full min-w-0 overflow-hidden rounded-xl bg-neutral-800 sm:min-h-[280px] lg:min-h-[360px]">
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
                <div className="min-w-0 lg:pb-2">
                  <h2 className="font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-[2.5rem]">
                    {featured.title}
                  </h2>
                  <p className="mt-3 text-sm text-neutral-400">
                    {featured.instructor_name ?? ORG.instructor}
                  </p>
                  <p className="mt-5 max-w-md text-[15px] leading-relaxed text-neutral-400">
                    {featured.short_description ?? featured.description}
                  </p>
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

        {/* Course grid */}
        <section id="courses" className={`bg-neutral-50 ${SECTION}`}>
          <div className={CONTAINER}>
            <HomepageCurrencyBar sticky />

            <div className="mt-6 flex items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">
                  Catalog
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-neutral-950 sm:text-3xl">
                  All courses
                </h2>
              </div>
              <Link
                href="/browse"
                className="shrink-0 text-sm font-medium text-neutral-500 hover:text-brand"
              >
                Browse →
              </Link>
            </div>

            {catalog.length === 0 ? (
              <div className="mt-12 border border-dashed border-neutral-300 px-6 py-16 text-neutral-500">
                New courses launching soon.
              </div>
            ) : (
              <div className="mt-10 grid min-w-0 grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
                {catalog.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
