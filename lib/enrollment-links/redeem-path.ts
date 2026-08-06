import { createHash, randomBytes } from "node:crypto";

/** Pure helpers mirrored for unit tests (also in lib/enrollment-links/token.ts). */
export function generateEnrollmentLinkToken(): string {
  return `el_${randomBytes(32).toString("base64url")}`;
}

export function hashEnrollmentLinkToken(plaintext: string): string {
  return createHash("sha256").update(plaintext.trim()).digest("hex");
}

export function enrollmentLinkTokenPrefix(plaintext: string): string {
  const raw = plaintext.trim();
  if (raw.startsWith("el_")) return raw.slice(0, 11);
  return raw.slice(0, 8);
}

export function resolvePostRedeemPath(result: {
  redirectType: string;
  redirectCourseId: string | null;
  courses: Array<{ id: string }>;
  linkId: string;
}): string {
  switch (result.redirectType) {
    case "first_course":
      return result.courses[0]?.id ? `/courses/${result.courses[0].id}` : "/dashboard";
    case "dashboard":
      return "/dashboard";
    case "specific_course":
      return result.redirectCourseId
        ? `/courses/${result.redirectCourseId}`
        : "/dashboard";
    case "success_page":
    default:
      return `/enrollment/success?link=${encodeURIComponent(result.linkId)}`;
  }
}
