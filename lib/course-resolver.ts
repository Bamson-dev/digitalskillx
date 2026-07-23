export type CourseLookup = { id: string; title: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildCourseResolver(courses: CourseLookup[]) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const byTitle = new Map(courses.map((c) => [c.title.trim().toLowerCase(), c]));

  function fuzzyMatchTitle(ref: string) {
    const lower = ref.trim().toLowerCase();
    const exact = byTitle.get(lower);
    if (exact) return exact;

    const partial = courses.filter(
      (course) =>
        course.title.toLowerCase().includes(lower) || lower.includes(course.title.toLowerCase()),
    );
    if (partial.length === 1) return partial[0];
    if (partial.length > 1) {
      const startsWith = partial.filter((course) => course.title.toLowerCase().startsWith(lower));
      if (startsWith.length === 1) return startsWith[0];
      return partial.sort((a, b) => a.title.length - b.title.length)[0];
    }
    return null;
  }

  return function resolveCourseRef(
    ref: string | null | undefined,
    fallbackCourseId: string | null,
  ): { courseId: string | null; courseTitle: string | null; error?: string } {
    const trimmed = ref?.trim() ?? "";
    if (!trimmed) {
      if (!fallbackCourseId) return { courseId: null, courseTitle: null };
      const course = byId.get(fallbackCourseId);
      return course
        ? { courseId: course.id, courseTitle: course.title }
        : { courseId: null, courseTitle: null, error: "Default course not found." };
    }

    if (UUID_RE.test(trimmed)) {
      const course = byId.get(trimmed);
      if (course) return { courseId: course.id, courseTitle: course.title };
      if (fallbackCourseId) {
        const fallback = byId.get(fallbackCourseId);
        if (fallback) return { courseId: fallback.id, courseTitle: fallback.title };
      }
      return { courseId: null, courseTitle: null, error: `Unknown course id: ${trimmed}` };
    }

    const course = fuzzyMatchTitle(trimmed);
    if (course) return { courseId: course.id, courseTitle: course.title };

    // Gumroad/product exports often use storefront names that don't match LMS titles.
    // Prefer the admin-selected default course over failing the whole row.
    if (fallbackCourseId) {
      const fallback = byId.get(fallbackCourseId);
      if (fallback) return { courseId: fallback.id, courseTitle: fallback.title };
    }

    return { courseId: null, courseTitle: null, error: `Unknown course: ${trimmed}` };
  };
}
