/**
 * Storefront catalogue helpers — hide development/test courses from customers.
 * Does not delete rows; filters marketing surfaces only.
 */

const STOREFRONT_HIDDEN_TITLE =
  /^(RC Course\s+\d+|E2E test course|Automated test course|Test course\s+\d+)/i;

/** True when a course title should never appear on public/student upsell surfaces. */
export function isStorefrontHiddenTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  return STOREFRONT_HIDDEN_TITLE.test(title.trim());
}

export function filterStorefrontCourses<T extends { title?: string | null }>(
  courses: T[],
): T[] {
  return courses.filter((c) => !isStorefrontHiddenTitle(c.title));
}

/**
 * Prefer a featured course with a real thumbnail and non-test title.
 * Falls back to first storefront-visible course.
 */
export function pickFeaturedCourse<
  T extends { title?: string | null; thumbnail_url?: string | null },
>(courses: T[]): T | null {
  const visible = filterStorefrontCourses(courses);
  if (visible.length === 0) return null;
  const withThumb = visible.find((c) => Boolean(c.thumbnail_url?.trim()));
  return withThumb ?? visible[0] ?? null;
}
