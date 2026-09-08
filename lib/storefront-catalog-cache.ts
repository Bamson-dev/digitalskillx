import "server-only";
import { unstable_cache } from "next/cache";
import {
  fetchCourseCategories,
  fetchPublishedCourseById,
  fetchPublishedCourses,
  type CatalogCourse,
  type LandingCourse,
} from "@/lib/published-courses";

/** Storefront catalog cache — keeps Coolify web process responsive under load. */
export const STOREFRONT_CATALOG_REVALIDATE_SECONDS = 120;

const DEFAULT_CATALOG_SELECT =
  "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, instructor_name, is_coming_soon, created_at, category:course_categories(name)";

const DEFAULT_LANDING_SELECT =
  "id, title, description, short_description, thumbnail_url, price_ngn, price_usd, learning_outcomes, instructor_name, instructor_bio, promo_video_url, certificate_enabled, is_coming_soon, modules(id, title, position, lessons(id, title, position, lesson_type))";

export const getCachedPublishedCatalog = unstable_cache(
  async () => fetchPublishedCourses<CatalogCourse>(DEFAULT_CATALOG_SELECT),
  ["storefront-catalog-v1"],
  { revalidate: STOREFRONT_CATALOG_REVALIDATE_SECONDS },
);

export const getCachedCourseCategories = unstable_cache(
  async () => fetchCourseCategories(),
  ["storefront-categories-v1"],
  { revalidate: STOREFRONT_CATALOG_REVALIDATE_SECONDS },
);

export const getCachedStorefrontTrustStats = unstable_cache(
  async () => {
    const { bootstrapRuntimeSecrets } = await import("@/lib/bootstrap-runtime-secrets");
    const { createAdminClientAsync } = await import("@/lib/supabase/admin");
    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync();
    const [enrollmentsRes, certsRes] = await Promise.all([
      admin.from("enrollments").select("id", { count: "exact", head: true }),
      admin.from("certificates").select("id", { count: "exact", head: true }),
    ]);
    return {
      students: enrollmentsRes.count ?? 0,
      certificates: certsRes.count ?? 0,
    };
  },
  ["storefront-trust-stats-v1"],
  { revalidate: STOREFRONT_CATALOG_REVALIDATE_SECONDS },
);

export const getCachedPublishedCourseLanding = unstable_cache(
  async (id: string) => fetchPublishedCourseById<LandingCourse>(id, DEFAULT_LANDING_SELECT),
  ["storefront-course-landing-v1"],
  { revalidate: STOREFRONT_CATALOG_REVALIDATE_SECONDS },
);
