import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Award, BookOpen, Megaphone, PenLine, ShoppingBag, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { CourseCard } from "@/components/marketplace/course-card";
import { CourseThumbnailPlaceholder } from "@/components/marketplace/course-thumbnail-placeholder";
import { PriceDisplay } from "@/components/marketplace/price-display";
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

  const [{ data: courses }, { data: categories }, trustStats] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, category:course_categories(name)",
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false }),
    supabase.from("course_categories").select("id, name, slug").order("name"),
    fetchTrustStats(),
  ]);

  type CourseRow = NonNullable<typeof courses>[number] & {
    category?: { name: string } | null;
  };

  const catalog = (courses ?? []).map((c) => {
    const row = c as CourseRow;
    return {
      ...row,
      category_name: row.category?.name ?? null,
    };
  });
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
      : CATEGORY_ICONS.map((c) => ({ id: c.name, name: c.name, slug: c.name.toLowerCase() }));

  const categoryTags =
    (categories ?? []).length > 0
      ? (categories ?? []).slice(0, 3).map((c) => c.name)
      : ["Marketing", "Sales", "Ads"];

  const trustItems = [
    { label: "Courses", value: trustStats.courses, icon: BookOpen },
    { label: "Students enrolled", value: trustStats.students, icon: Users },
    { label: "Certificates issued", value: trustStats.certificates, icon: Award },
  ].filter((item) => item.value > 0);

  const showTrustRow = trustItems.length > 0;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-900">
      <MarketplaceNav user={profile} />

      <main className="flex-1 overflow-x-hidden">
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
                {categoryTags.map((tag) => (
                  <Link
                    key={tag}
                    href={`/browse?category=${encodeURIComponent(tag)}`}
                    className="rounded-full border border-surface-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-neutral-600 transition hover:border-brand hover:text-brand min-h-[32px] inline-flex items-center"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/browse"
                  className="inline-flex h-12 min-h-[48px] items-center justify-center rounded-lg bg-brand px-8 text-sm font-bold text-white transition hover:bg-brand-700"
                >
                  Explore Courses
                </Link>
                {!user ? (
                  <Link
                    href="/register"
                    className="inline-flex h-12 min-h-[48px] items-center justify-center rounded-lg border border-surface-border px-8 text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50"
                  >
                    Get Started
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
              {featured ? (
                <Link
                  href={`/course/${featured.id}`}
                  className="group block overflow-hidden rounded-2xl border border-surface-border bg-white shadow-card transition hover:border-neutral-300 hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {featured.thumbnail_url ? (
                      <Image
                        src={featured.thumbnail_url}
                        alt={featured.title}
                        fill
                        className="object-cover transition duration-500 group-hover:scale-[1.02]"
                        priority
                        sizes="(max-width: 1024px) 100vw, 50vw"
                      />
                    ) : (
                      <CourseThumbnailPlaceholder title={featured.title} size="hero" />
                    )}
                  </div>
                  <div className="border-t border-surface-border p-4 sm:p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand">
                      Featured course
                    </p>
                    <p className="mt-1 font-display text-lg font-bold text-neutral-900">
                      {featured.title}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-neutral-600">
                      {featured.short_description ?? featured.description}
                    </p>
                    <p className="mt-3 text-lg font-bold text-brand">
                      <PriceDisplay course={featured} />
                    </p>
                  </div>
                </Link>
              ) : (
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-dashed border-surface-border bg-surface-muted">
                  <CourseThumbnailPlaceholder title="Digital Skills Training" size="hero" />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Trust row */}
        {showTrustRow ? (
          <section className="border-b border-surface-border bg-surface-muted px-4 py-8 sm:px-6">
            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
              {trustItems.map(({ label, value, icon: Icon }) => (
                <div
                  key={label}
                  className="flex items-center gap-4 rounded-xl border border-surface-border bg-white px-5 py-4"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                    <Icon className="h-5 w-5 text-brand" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-bold text-neutral-900">
                      {value.toLocaleString()}
                    </p>
                    <p className="text-sm text-neutral-500">{label}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Categories */}
        <section className="border-b border-surface-border bg-white px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
                Explore by Category
              </h2>
              <Link href="/browse" className="shrink-0 text-sm font-semibold text-brand hover:text-brand-700">
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
              {displayCategories.map((cat, i) => {
                const Icon = CATEGORY_ICONS[i]?.icon ?? Megaphone;
                return (
                  <Link
                    key={cat.id}
                    href={`/browse?category=${encodeURIComponent(cat.name)}`}
                    className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-xl border border-surface-border bg-surface-muted p-4 text-center transition hover:border-brand/30 hover:bg-white hover:shadow-card"
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
        <section className="border-b border-surface-border bg-surface-muted px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <span className="rounded-full bg-brand/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand">
              Flagship Program
            </span>
            {featured ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-white shadow-card">
                <div className="grid lg:grid-cols-2">
                  <div className="relative min-h-[220px] lg:min-h-[300px]">
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
                      <p className="text-xl font-bold text-brand sm:text-2xl">
                        <PriceDisplay course={featured} />
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

        {/* Course grid — all published courses */}
        <section id="courses" className="bg-white px-4 py-10 sm:px-6 sm:py-14">
          <div className="mx-auto max-w-6xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold text-neutral-900 sm:text-2xl">
                  All Courses
                </h2>
                <p className="mt-1 text-sm text-neutral-500">
                  Invest in skills. Unlock instantly after purchase.
                </p>
              </div>
              <Link href="/browse" className="shrink-0 text-sm font-semibold text-brand hover:text-brand-700">
                Browse all →
              </Link>
            </div>

            {catalog.length === 0 ? (
              <div className="mt-10 rounded-xl border border-dashed border-surface-border bg-surface-muted py-16 text-center text-neutral-500">
                New courses launching soon. Check back shortly.
              </div>
            ) : (
              <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
