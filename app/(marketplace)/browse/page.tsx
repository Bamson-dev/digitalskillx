import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchCourseCategories, fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { BrowseCatalog } from "@/components/marketplace/browse-catalog";
import { withTimeout } from "@/lib/with-timeout";

export const metadata: Metadata = {
  title: "Browse Courses",
  description: `Explore all courses on ${ORG.platformName}.`,
};

export const dynamic = "force-dynamic";

const BROWSE_FETCH_TIMEOUT_MS = 4_000;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
  const supabase = createClient();
  const user = await withTimeout(
    supabase.auth.getUser().then((res) => res.data.user),
    BROWSE_FETCH_TIMEOUT_MS,
    null,
  );

  let profile = null;
  if (user) {
    const profileRes = await withTimeout(
      supabase.from("profiles").select("full_name, email, role").eq("id", user.id).single(),
      BROWSE_FETCH_TIMEOUT_MS,
      { data: null, error: null },
    );
    profile = profileRes.data;
  }

  const [courses, categories] = await withTimeout(
    Promise.all([
      fetchPublishedCourses<CatalogCourse>(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon, created_at, category:course_categories(name)",
      ),
      fetchCourseCategories(),
    ]),
    BROWSE_FETCH_TIMEOUT_MS,
    [[], []] as [CatalogCourse[], Awaited<ReturnType<typeof fetchCourseCategories>>],
  );

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={profile} />

      <main className="flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1200px] overflow-x-hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Catalog
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            Browse courses
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-500">
            Search and filter published programs.
          </p>

          <div className="mt-10">
            <BrowseCatalog
              courses={catalog}
              categories={categories ?? []}
              initialQuery={searchParams.q ?? ""}
              initialCategory={searchParams.category ?? ""}
            />
          </div>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
