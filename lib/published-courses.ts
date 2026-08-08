import "server-only";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isMissingColumnError } from "@/lib/schema-guard";
import { filterStorefrontCourses, isStorefrontHiddenTitle } from "@/lib/storefront-visibility";

export type CatalogCourse = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  instructor_name: string | null;
  is_coming_soon?: boolean;
  created_at?: string;
  category?: { name: string } | null;
};

export type LandingCourse = CatalogCourse & {
  learning_outcomes: string[] | null;
  instructor_bio: string | null;
  promo_video_url: string | null;
  certificate_enabled?: boolean | null;
  modules: {
    id: string;
    title: string;
    position: number;
    lessons: { id: string; title: string; position: number; lesson_type: string }[];
  }[];
};

export {
  filterStorefrontCourses,
  pickFeaturedCourse,
  isStorefrontHiddenTitle,
} from "@/lib/storefront-visibility";

async function catalogClient() {
  await bootstrapRuntimeSecrets();
  return createAdminClientAsync(createClient());
}

/** Public storefront catalog — bypasses RLS (published course marketing data). */
export async function fetchPublishedCourses<T extends { title?: string | null } = CatalogCourse>(
  select: string,
  options?: { includeHiddenDevCourses?: boolean },
): Promise<T[]> {
  const admin = await catalogClient();
  const { data, error } = await admin
    .from("courses")
    .select(select)
    .eq("visibility", "published")
    .order("created_at", { ascending: false });

  if (error && isMissingColumnError(error.message) && select.includes("is_coming_soon")) {
    console.error("[fetchPublishedCourses] schema drift; retrying without is_coming_soon", error.message);
    const fallbackSelect = select.replace(/,?\s*is_coming_soon\b/g, "").replace(/is_coming_soon,?\s*/g, "");
    const fallback = await admin
      .from("courses")
      .select(fallbackSelect)
      .eq("visibility", "published")
      .order("created_at", { ascending: false });
    if (fallback.error) throw new Error(fallback.error.message);
    const rows = ((fallback.data ?? []) as unknown as T[]).map((row) => ({
      ...(row as object),
      is_coming_soon: false,
    })) as unknown as T[];
    return options?.includeHiddenDevCourses ? rows : filterStorefrontCourses(rows);
  }

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as T[];
  return options?.includeHiddenDevCourses ? rows : filterStorefrontCourses(rows);
}

/** Single published course for landing pages / metadata. */
export async function fetchPublishedCourseById<T = LandingCourse>(
  id: string,
  select: string,
): Promise<T | null> {
  const admin = await catalogClient();
  const { data, error } = await admin
    .from("courses")
    .select(select)
    .eq("id", id)
    .eq("visibility", "published")
    .maybeSingle();

  if (error && isMissingColumnError(error.message) && select.includes("is_coming_soon")) {
    console.error("[fetchPublishedCourseById] schema drift; retrying without is_coming_soon", error.message);
    const fallbackSelect = select.replace(/,?\s*is_coming_soon\b/g, "").replace(/is_coming_soon,?\s*/g, "");
    const fallback = await admin
      .from("courses")
      .select(fallbackSelect)
      .eq("id", id)
      .eq("visibility", "published")
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    if (!fallback.data) return null;
    const fallbackRow = {
      ...(fallback.data as object),
      is_coming_soon: false,
    } as unknown as T & { title?: string | null };
    if (isStorefrontHiddenTitle(fallbackRow.title)) return null;
    return fallbackRow as T;
  }

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as T & { title?: string | null };
  if (isStorefrontHiddenTitle(row.title)) return null;

  return row as T;
}

/** Category list for homepage filters (public read). */
export async function fetchCourseCategories() {
  const admin = await catalogClient();
  const { data, error } = await admin
    .from("course_categories")
    .select("id, name, slug")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
