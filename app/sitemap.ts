import type { MetadataRoute } from "next";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/org";

/** Fetch courses at request time — build containers may not reach Supabase. */
export const dynamic = "force-dynamic";

function staticEntries(base: string): MetadataRoute.Sitemap {
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/learn`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/guides`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/support`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = staticEntries(base);

  try {
    const admin = await createAdminClientAsync();
    const { data: courses, error } = await admin
      .from("courses")
      .select("id, updated_at")
      .eq("visibility", "published");

    if (error) {
      console.error("[sitemap] courses query failed:", error.message);
      return staticPages;
    }

    const coursePages: MetadataRoute.Sitemap = (courses ?? []).map((c) => ({
      url: `${base}/course/${c.id}`,
      lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));

    let learnPages: MetadataRoute.Sitemap = [];
    let categoryPages: MetadataRoute.Sitemap = [];
    let guidePages: MetadataRoute.Sitemap = [];
    const { data: paths, error: pathError } = await admin
      .from("learning_paths")
      .select("slug, updated_at, published_at, category, status")
      .eq("status", "published")
      .limit(500);

    if (pathError) {
      // Table may not exist until migration 0042 is applied.
      console.error("[sitemap] learning_paths query failed:", pathError.message);
    } else {
      const { CATEGORY_HUB_MIN_PATHS, isLibraryCategoryHubSlug } = await import(
        "@/lib/content-factory/seo-shared"
      );
      const { normalizeLibraryCategory, LIBRARY_CATEGORIES } = await import(
        "@/lib/content-factory/library-shared"
      );
      learnPages = (paths ?? [])
        .filter((p) => !isLibraryCategoryHubSlug(p.slug))
        .map((p) => ({
          url: `${base}/learn/${p.slug}`,
          lastModified: p.updated_at
            ? new Date(p.updated_at)
            : p.published_at
              ? new Date(p.published_at)
              : new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.75,
        }));
      const counts = new Map<string, number>();
      for (const path of paths ?? []) {
        const cat = normalizeLibraryCategory(path.category);
        if (cat === "all" || cat === "other") continue;
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
      categoryPages = LIBRARY_CATEGORIES.filter((c) => c.id !== "all")
        .filter((c) => (counts.get(c.id) ?? 0) >= CATEGORY_HUB_MIN_PATHS)
        .map((c) => ({
          url: `${base}/learn/${c.id}`,
          lastModified: new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }));
    }

    const { data: guides, error: guideError } = await admin
      .from("authority_articles")
      .select("slug, updated_at, published_at, status")
      .eq("status", "published")
      .limit(500);
    if (guideError) {
      // Table may not exist until migration 0045 is applied.
      console.error("[sitemap] authority_articles query failed:", guideError.message);
    } else {
      guidePages = (guides ?? []).map((g) => ({
        url: `${base}/guides/${g.slug}`,
        lastModified: g.updated_at
          ? new Date(g.updated_at)
          : g.published_at
            ? new Date(g.published_at)
            : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.65,
      }));
    }

    let landingPages: MetadataRoute.Sitemap = [];
    const { data: landings, error: landingError } = await admin
      .from("imported_landing_pages" as never)
      .select("slug, updated_at, published_at, status")
      .eq("status", "published")
      .limit(500);
    if (landingError) {
      // Table may not exist until migration 0047 is applied.
      console.error("[sitemap] imported_landing_pages query failed:", landingError.message);
    } else {
      landingPages = ((landings as Array<{ slug: string; updated_at?: string; published_at?: string }> | null) ?? []).map(
        (g) => ({
          url: `${base}/p/${g.slug}`,
          lastModified: g.updated_at
            ? new Date(g.updated_at)
            : g.published_at
              ? new Date(g.published_at)
              : new Date(),
          changeFrequency: "weekly" as const,
          priority: 0.7,
        }),
      );
    }

    return [
      ...staticPages,
      ...coursePages,
      ...categoryPages,
      ...learnPages,
      ...guidePages,
      ...landingPages,
    ];
  } catch (err) {
    console.error("[sitemap] failed to load courses:", err);
    return staticPages;
  }
}
