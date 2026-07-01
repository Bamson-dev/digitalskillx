import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/org";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const admin = createAdminClient();
  const { data: courses } = await admin
    .from("courses")
    .select("id, updated_at")
    .eq("visibility", "published");

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/refund-policy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/support`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.4 },
  ];

  const coursePages: MetadataRoute.Sitemap = (courses ?? []).map((c) => ({
    url: `${base}/course/${c.id}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...coursePages];
}
