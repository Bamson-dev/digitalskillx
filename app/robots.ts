import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/org";

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/course/", "/about", "/privacy", "/terms", "/refund-policy", "/support"],
        disallow: ["/admin/", "/dashboard", "/courses/", "/lessons/", "/api/", "/login", "/register"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
