/** Reserved slugs that must never be used for imported landing pages. */

export const RESERVED_LANDING_SLUGS = new Set([
  "admin",
  "api",
  "about",
  "auth",
  "browse",
  "course",
  "courses",
  "dashboard",
  "enroll",
  "enrollment",
  "forgot-password",
  "guides",
  "learn",
  "lessons",
  "login",
  "p",
  "privacy",
  "purchase",
  "quizzes",
  "refund-policy",
  "register",
  "reset-password",
  "robots",
  "settings",
  "sitemap",
  "support",
  "terms",
  "unsubscribe",
  "verify",
  "assignments",
  "certificates",
]);

export function normalizeLandingSlug(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function isReservedLandingSlug(slug: string): boolean {
  return RESERVED_LANDING_SLUGS.has(normalizeLandingSlug(slug));
}

export function assertLandingSlug(slug: string): { ok: true; slug: string } | { ok: false; error: string } {
  const normalized = normalizeLandingSlug(slug);
  if (normalized.length < 2) return { ok: false, error: "Slug must be at least 2 characters." };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return { ok: false, error: "Slug may only contain lowercase letters, numbers, and hyphens." };
  }
  if (isReservedLandingSlug(normalized)) {
    return { ok: false, error: `Slug “${normalized}” is reserved.` };
  }
  return { ok: true, slug: normalized };
}
