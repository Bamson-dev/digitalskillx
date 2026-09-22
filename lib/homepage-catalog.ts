import { isCatalogCourseFree } from "@/lib/currency";
import { pickFeaturedCourse } from "@/lib/storefront-visibility";

export type HomepageCatalogCourse = {
  id: string;
  title: string;
  description: string | null;
  short_description: string | null;
  thumbnail_url: string | null;
  price_ngn: number;
  price_usd: number;
  instructor_name?: string | null;
  category_name?: string | null;
  is_coming_soon?: boolean;
  created_at?: string | null;
};

/** Max cards shown on the homepage before “view all” — keeps the page scannable. */
export const HOMEPAGE_SECTION_COURSE_LIMIT = 6;

export function partitionHomepageCatalog<T extends HomepageCatalogCourse>(courses: T[]) {
  const featured = pickFeaturedCourse(courses);
  const free = courses.filter((c) => isCatalogCourseFree(c));
  const paid = courses.filter((c) => !isCatalogCourseFree(c));

  return {
    featured,
    free,
    paid,
    freePreview: free.slice(0, HOMEPAGE_SECTION_COURSE_LIMIT),
    paidPreview: paid.slice(0, HOMEPAGE_SECTION_COURSE_LIMIT),
    hasMoreFree: free.length > HOMEPAGE_SECTION_COURSE_LIMIT,
    hasMorePaid: paid.length > HOMEPAGE_SECTION_COURSE_LIMIT,
  };
}
