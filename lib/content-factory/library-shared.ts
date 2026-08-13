/** Pure Stage 7 learning-library helpers (no secrets, no I/O). */

export const LIBRARY_PAGE_SIZE = 20;
export const LIBRARY_RELATED_LIMIT = 4;

export const LIBRARY_CATEGORIES = [
  { id: "all", label: "All" },
  { id: "digital-marketing", label: "Digital Marketing" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "programming", label: "Programming" },
  { id: "data", label: "Data" },
  { id: "design", label: "Design" },
  { id: "ai", label: "AI" },
  { id: "finance", label: "Finance" },
  { id: "career-skills", label: "Career Skills" },
  { id: "productivity", label: "Productivity" },
] as const;

export type LibraryCategoryId = (typeof LIBRARY_CATEGORIES)[number]["id"];

const CATEGORY_ALIASES: Record<string, LibraryCategoryId> = {
  marketing: "digital-marketing",
  "digital marketing": "digital-marketing",
  ads: "digital-marketing",
  business: "business",
  technology: "technology",
  tech: "technology",
  programming: "programming",
  coding: "programming",
  python: "programming",
  data: "data",
  analytics: "data",
  design: "design",
  ui: "design",
  ux: "design",
  ai: "ai",
  "artificial intelligence": "ai",
  finance: "finance",
  career: "career-skills",
  "career skills": "career-skills",
  productivity: "productivity",
};

export function sanitizeLibraryQuery(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .slice(0, 80)
    .replace(/[%*,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseLibraryPage(raw: string | null | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(100, n);
}

export function parseLibraryCategory(raw: string | null | undefined): LibraryCategoryId {
  const id = String(raw ?? "all").trim().toLowerCase();
  return LIBRARY_CATEGORIES.some((c) => c.id === id) ? (id as LibraryCategoryId) : "all";
}

export function libraryCategoryLabel(id: LibraryCategoryId): string {
  return LIBRARY_CATEGORIES.find((c) => c.id === id)?.label ?? "All";
}

export function normalizeLibraryCategory(raw: string | null | undefined): LibraryCategoryId | "other" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "other";
  const direct = LIBRARY_CATEGORIES.find((c) => c.id !== "all" && c.label.toLowerCase() === value);
  if (direct) return direct.id;
  if (CATEGORY_ALIASES[value]) return CATEGORY_ALIASES[value];
  for (const [alias, id] of Object.entries(CATEGORY_ALIASES)) {
    if (value.includes(alias)) return id;
  }
  return "other";
}

export function categoryMatchesFilter(stored: string | null | undefined, filter: LibraryCategoryId): boolean {
  if (filter === "all") return true;
  return normalizeLibraryCategory(stored) === filter;
}

export function formatLearningMinutes(totalSeconds: number | null | undefined): string | null {
  if (totalSeconds == null || !Number.isFinite(totalSeconds) || totalSeconds < 60) return null;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (!rem) return `About ${hours} hr`;
  return `About ${hours} hr ${rem} min`;
}

export function relatedLearningPaths<T extends { id: string; category: string; title: string }>(
  catalog: T[],
  seed: { id: string; category: string; title: string },
  limit = LIBRARY_RELATED_LIMIT,
): T[] {
  const seedCat = normalizeLibraryCategory(seed.category);
  const scored = catalog
    .filter((row) => row.id !== seed.id)
    .map((row) => {
      let score = 0;
      if (seedCat !== "other" && normalizeLibraryCategory(row.category) === seedCat) score += 50;
      else if (row.category && seed.category && row.category.toLowerCase() === seed.category.toLowerCase()) {
        score += 40;
      }
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((item) => item.row);
}

export function libraryHref(params: { q?: string; category?: string; page?: number }): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category && params.category !== "all") search.set("category", params.category);
  if (params.page && params.page > 1) search.set("page", String(params.page));
  const qs = search.toString();
  return qs ? `/learn?${qs}` : "/learn";
}

export function buildLearnJsonLd(input: {
  siteUrl: string;
  slug: string;
  title: string;
  description: string;
  artworkUrl: string | null;
  creatorName: string | null;
  lessons: Array<{ title: string; youtubeUrl: string; youtubeVideoId: string }>;
}): Record<string, unknown> {
  const pageUrl = `${input.siteUrl}/learn/${input.slug}`;
  const videos = input.lessons.slice(0, 40).map((lesson) => ({
    "@type": "VideoObject",
    name: lesson.title,
    url: lesson.youtubeUrl,
    embedUrl: `https://www.youtube-nocookie.com/embed/${lesson.youtubeVideoId}`,
    thumbnailUrl: `https://i.ytimg.com/vi/${lesson.youtubeVideoId}/hqdefault.jpg`,
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: input.siteUrl },
          { "@type": "ListItem", position: 2, name: "Free Learning Library", item: `${input.siteUrl}/learn` },
          { "@type": "ListItem", position: 3, name: input.title, item: pageUrl },
        ],
      },
      {
        "@type": "Course",
        name: input.title,
        description: input.description,
        url: pageUrl,
        isAccessibleForFree: true,
        image: input.artworkUrl || undefined,
        provider: {
          "@type": "Organization",
          name: "DigitalSkillX",
          url: input.siteUrl,
        },
        author: input.creatorName
          ? { "@type": "Person", name: input.creatorName }
          : undefined,
        hasCourseInstance: {
          "@type": "CourseInstance",
          courseMode: "online",
        },
        video: videos,
      },
    ],
  };
}

export function jsonLdIsSafe(value: unknown): boolean {
  const raw = JSON.stringify(value);
  if (raw.length > 40_000) return false;
  if (/service_role|DEEPSEEK|OPENAI|YOUTUBE_API|CONTABO|Bearer /i.test(raw)) return false;
  return true;
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const LEARN_PROGRESS_EVENT = "dsx-learn-progress";

export function learnProgressStorageKey(slug: string) {
  return `dsx-learn-progress:${slug}`;
}

export function parseLearnProgress(raw: string | null | undefined): Record<string, boolean> {
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === true).map(([key]) => [key, true]),
    );
  } catch {
    return {};
  }
}

export function summarizeLearnCompletion(progress: Record<string, boolean>, lessonIds: string[]) {
  const total = lessonIds.length;
  const completed = lessonIds.filter((id) => progress[id]).length;
  const pct = total ? Math.round((completed / total) * 100) : 0;
  return { completed, total, pct, isComplete: total > 0 && completed === total };
}

export function pathCertificateOfferable(path: {
  certificate_enabled?: boolean | null;
  certificate_price_ngn?: number | null;
  status?: string | null;
}) {
  return (
    path.status === "published" &&
    path.certificate_enabled === true &&
    typeof path.certificate_price_ngn === "number" &&
    path.certificate_price_ngn > 0
  );
}
