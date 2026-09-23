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

/** Premium grid preview when the paid catalog grows very large. Free courses always show in full. */
export const HOMEPAGE_PAID_COURSE_LIMIT = 24;

export function partitionHomepageCatalog<T extends HomepageCatalogCourse>(courses: T[]) {
  const featured = pickFeaturedCourse(courses);
  const free = courses.filter((c) => isCatalogCourseFree(c));
  const paid = courses.filter((c) => !isCatalogCourseFree(c));

  return {
    featured,
    free,
    paid,
    /** Every published free marketplace course belongs on the homepage. */
    freePreview: free,
    paidPreview: paid.slice(0, HOMEPAGE_PAID_COURSE_LIMIT),
    hasMoreFree: false,
    hasMorePaid: paid.length > HOMEPAGE_PAID_COURSE_LIMIT,
  };
}

export const HOMEPAGE_FREE_LIBRARY_LIMIT = 48;
