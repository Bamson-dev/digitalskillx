import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Megaphone, PenLine, ShoppingBag, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchCourseCategories, fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseCard } from "@/components/marketplace/course-card";
import { DualPriceDisplay } from "@/components/marketplace/price-display";
import { EnrollButton } from "@/components/marketplace/enroll-button";

export const metadata: Metadata = {
  title: "Learn Profitable Digital Skills",
  description: ORG.tagline,
};

export const dynamic = "force-dynamic";

const CATEGORY_ICONS = [
  { name: "Paid Ads", icon: Megaphone },
  { name: "Sales & Funnels", icon: TrendingUp },
  { name: "E-Commerce", icon: ShoppingBag },
  { name: "Copywriting", icon: PenLine },
];

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

  const [courses, categories] = await Promise.all([
    fetchPublishedCourses<CatalogCourse>(
      "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, category:course_categories(name)",
    ),
    fetchCourseCategories(),
  ]);

  type CourseRow = CatalogCourse;

  const catalog = (courses ?? []).map((c) => {
    const row = c as CourseRow;
    return {
      ...row,
      category_name: row.category?.name ?? null,
    };
  });
  const featured = catalog[0] ?? null;
  const popular = catalog.slice(0, 6);

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
      : CATEGORY_ICONS.map((c) => ({ id: c.name, name: c.name, slug: c.name.toLowerCase() }));

  return (
    <div className="flex min-h-screen flex-col bg-white text-neutral-900">
      <MarketplaceNav user={profile} />

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-surface-border bg-white px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:items-center lg:gap-12">
            <div className="order-2 lg:order-1">
              <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                Master Profitable Digital Skills
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-neutral-600 sm:text-lg">
                Learn directly from industry leaders who&apos;ve scaled 7 and 8-figure businesses.
                Apply proven systems today.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {["Marketing", "Sales", "Ads"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-surface-border bg-surface-muted px-3 py-1 text-xs font-medium text-neutral-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="#courses"
                  className="inline-flex h-12 min-h-[48px] items-center justify-center rounded-lg bg-brand px-8 text-sm font-bold text-white transition hover:bg-brand-700"
                >
                  Explore Courses
                </Link>
                {!user ? (
                  <Link
                    href="/register"
                    className="inline-flex h-12 min-h-[48px] items-center justify-center rounded-lg border border-surface-border px-8 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                  >
                    Create Account
                  </Link>
                ) : (
                  <Link
                    href="/dashboard"
                    className="inline-flex h-12 min-h-[48px] items-center justify-center rounded-lg border border-surface-border px-8 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                  >
                    Go to dashboard
                  </Link>
                )}
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-surface-border bg-surface-muted shadow-card">
                {featured?.thumbnail_url ? (
                  <Image
                    src={featured.thumbnail_url}
                    alt=""
                    fill
                    className="object-cover"
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-gradient-to-br from-neutral-100 to-neutral-200 text-neutral-400">
                    <span className="text-sm">Course preview</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Categories */}
        <section className="border-b border-surface-border bg-surface-muted px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
                Explore by Category
              </h2>
              <Link href="#courses" className="text-sm font-semibold text-brand hover:text-brand-700">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {displayCategories.map((cat, i) => {
                const Icon = CATEGORY_ICONS[i]?.icon ?? Megaphone;
                return (
                  <Link
                    key={cat.id}
                    href="#courses"
                    className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-xl border border-surface-border bg-white p-4 text-center transition hover:border-neutral-300 hover:shadow-card"
                  >
                    <Icon className="h-6 w-6 text-neutral-800" />
                    <span className="text-sm font-semibold text-neutral-800">{cat.name}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* Featured flagship */}
        <section className="border-b border-surface-border bg-surface-muted/80 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand">
              Flagship Program
            </span>
            {featured ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
                <div className="grid lg:grid-cols-2">
                  <div className="relative min-h-[220px] bg-neutral-100 lg:min-h-[300px]">
                    {featured.thumbnail_url ? (
                      <Image
                        src={featured.thumbnail_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    ) : (
                      <div className="flex h-full min-h-[220px] items-center justify-center text-neutral-400">
                        Course artwork
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col justify-center p-6 sm:p-8">
                    <h2 className="font-display text-2xl font-bold text-neutral-900 sm:text-3xl">
                      {featured.title}
                    </h2>
                    <p className="mt-1 text-sm text-neutral-500">
                      By {featured.instructor_name ?? ORG.instructor}
                    </p>
                    <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-neutral-600">
                      {featured.short_description ?? featured.description}
                    </p>
                    <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
                      <p className="text-xl sm:text-2xl">
                        <DualPriceDisplay course={featured} />
                      </p>
                      <EnrollButton
                        courseId={featured.id}
                        priceNgn={featured.price_ngn}
                        priceUsd={featured.price_usd}
                        isEnrolled={featuredEnrolled}
                        isLoggedIn={Boolean(user)}
                        className="sm:min-w-[160px]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-surface-border bg-white px-6 py-14 text-center text-neutral-500">
                Publish your first course in admin to show the flagship program here.
              </div>
            )}
          </div>
        </section>

        {/* Course grid */}
        <section id="courses" className="bg-white px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto max-w-6xl">
            <h2 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
              Popular Courses
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Invest in skills. Unlock instantly after purchase.
            </p>

            {popular.length === 0 ? (
              <div className="mt-10 rounded-xl border border-dashed border-surface-border bg-surface-muted py-16 text-center text-neutral-500">
                New courses launching soon. Check back shortly.
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {popular.map((course) => (
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
