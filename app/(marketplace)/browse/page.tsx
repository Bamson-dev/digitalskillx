import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { fetchCourseCategories, fetchPublishedCourses, type CatalogCourse } from "@/lib/published-courses";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { BrowseCatalog } from "@/components/marketplace/browse-catalog";

export const metadata: Metadata = {
  title: "Browse Courses",
  description: `Explore all courses on ${ORG.platformName}.`,
};

export const dynamic = "force-dynamic";

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string };
}) {
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

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={profile} />

      <main className="flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1200px] overflow-x-hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-400">Catalog</p>
          <h1 className="mt-2 font-display text-3xl font-bold text-neutral-950 sm:text-4xl">
            Browse courses
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-500">
            Filter by category or search by title.
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
