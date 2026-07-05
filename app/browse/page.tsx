import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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

  const [{ data: courses }, { data: categories }] = await Promise.all([
    supabase
      .from("courses")
      .select(
        "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, created_at, category:course_categories(name)",
      )
      .eq("visibility", "published")
      .order("created_at", { ascending: false }),
    supabase.from("course_categories").select("id, name, slug").order("name"),
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

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-900">
      <MarketplaceNav user={profile} />

      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mx-auto max-w-6xl overflow-x-hidden">
          <h1 className="font-display text-2xl font-bold text-neutral-900 sm:text-3xl">
            Browse Courses
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-600 sm:text-base">
            Find the right program for your goals. Filter by category or search by title.
          </p>

          <div className="mt-8">
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
