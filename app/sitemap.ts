import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/org";

/** Fetch courses at request time — build containers may not reach Supabase. */
export const dynamic = "force-dynamic";

function staticEntries(base: string): MetadataRoute.Sitemap {
  return [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/learn`, lastModified: new Date(), changeFrequency: "daily", priority: 0.85 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/support`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const staticPages = staticEntries(base);

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return staticPages;
  }

  try {
    const admin = createAdminClient();
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
    const { data: paths, error: pathError } = await admin
      .from("learning_paths")
      .select("slug, updated_at, published_at")
      .eq("status", "published")
      .limit(500);

    if (pathError) {
      // Table may not exist until migration 0042 is applied.
      console.error("[sitemap] learning_paths query failed:", pathError.message);
    } else {
      learnPages = (paths ?? []).map((p) => ({
        url: `${base}/learn/${p.slug}`,
        lastModified: p.updated_at
          ? new Date(p.updated_at)
          : p.published_at
            ? new Date(p.published_at)
            : new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.75,
      }));
    }

    return [...staticPages, ...coursePages, ...learnPages];
  } catch (err) {
    console.error("[sitemap] failed to load courses:", err);
    return staticPages;
  }
}
