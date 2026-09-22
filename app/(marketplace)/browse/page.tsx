import type { Metadata } from "next";
import { ORG } from "@/lib/org";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { BrowseCatalog } from "@/components/marketplace/browse-catalog";
import {
  getCachedCourseCategories,
  getCachedPublishedCatalog,
  STOREFRONT_CATALOG_REVALIDATE_SECONDS,
} from "@/lib/storefront-catalog-cache";
import { withTimeout } from "@/lib/with-timeout";

export const metadata: Metadata = {
  title: "Browse Free & Premium Courses",
  description: `Explore free and premium courses on ${ORG.platformName}.`,
};

export const revalidate = STOREFRONT_CATALOG_REVALIDATE_SECONDS;

const BROWSE_CATALOG_TIMEOUT_MS = 12_000;
const BROWSE_SECONDARY_TIMEOUT_MS = 4_000;

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: { q?: string; category?: string; price?: string };
}) {
  const [courses, categories] = await Promise.all([
    withTimeout(
      getCachedPublishedCatalog(),
      BROWSE_CATALOG_TIMEOUT_MS,
      [] as Awaited<ReturnType<typeof getCachedPublishedCatalog>>,
    ),
    withTimeout(
      getCachedCourseCategories(),
      BROWSE_SECONDARY_TIMEOUT_MS,
      [] as Awaited<ReturnType<typeof getCachedCourseCategories>>,
    ),
  ]);

  const catalog = (courses ?? []).map((c) => ({
    ...c,
    category_name: c.category?.name ?? null,
  }));

  const price = searchParams.price === "free" || searchParams.price === "paid" ? searchParams.price : "";
  const heading =
    price === "free" ? "Free courses" : price === "paid" ? "Premium courses" : "Browse courses";
  const subcopy =
    price === "free"
      ? "Start learning without paying — practical free programs from DigitalSkillX."
      : price === "paid"
        ? "Go deeper with premium programs built for real-world digital skills."
        : "Search and filter published free and premium programs.";

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white text-neutral-800">
      <MarketplaceNav user={null} />

      <main className="flex-1 px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-[1200px] overflow-x-hidden">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            Catalog
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-neutral-950 sm:text-4xl">
            {heading}
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-neutral-500">{subcopy}</p>

          <div className="mt-10">
            <BrowseCatalog
              courses={catalog}
              categories={categories ?? []}
              initialQuery={searchParams.q ?? ""}
              initialCategory={searchParams.category ?? ""}
              initialPrice={price}
            />
          </div>
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
