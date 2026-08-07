import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashEnrollmentLinkToken } from "@/lib/enrollment-links/token";
import type {
  Database,
  EnrollmentLink,
  EnrollmentLinkAccess,
  EnrollmentLinkRedirect,
  EnrollmentLinkStatus,
} from "@/types/database";

export type EnrollmentLinkErrorCode =
  | "INVALID_LINK"
  | "DISABLED"
  | "EXPIRED"
  | "LIMIT_REACHED"
  | "IMPORTED_ONLY"
  | "UNAUTHORIZED"
  | "NO_COURSES"
  | "ENROLLMENT_FAILED";

export class EnrollmentLinkError extends Error {
  constructor(
    public readonly code: EnrollmentLinkErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EnrollmentLinkError";
  }
}

export const FRIENDLY_ERRORS: Record<EnrollmentLinkErrorCode, string> = {
  INVALID_LINK: "This Enrollment Link is invalid or no longer available.",
  DISABLED: "This Enrollment Link is no longer active.",
  EXPIRED: "This Enrollment Link has expired.",
  LIMIT_REACHED: "This Enrollment Link has already reached its maximum number of enrollments.",
  IMPORTED_ONLY: "This Enrollment Link is available only to invited students.",
  UNAUTHORIZED: "Please sign in to continue.",
  NO_COURSES: "Something went wrong. Please contact support.",
  ENROLLMENT_FAILED: "We couldn't complete your enrollment. Please try again or contact support.",
};

export type PublicLinkView = {
  id: string;
  name: string;
  description: string;
  accessType: EnrollmentLinkAccess;
  redirectType: EnrollmentLinkRedirect;
  redirectCourseId: string | null;
  courses: Array<{
    id: string;
    title: string;
    description: string | null;
    thumbnailUrl: string | null;
    certificateEnabled: boolean;
    lessonCount: number;
  }>;
};

function deriveExpired(link: EnrollmentLink): boolean {
  return Boolean(link.expires_at && new Date(link.expires_at).getTime() < Date.now());
}

/**
 * Validates an enrollment link for public display / redeem.
 * Does not expose token hashes or internal IDs beyond link id for authenticated redeem.
 */
export async function loadAndValidateEnrollmentLink(
  admin: SupabaseClient<Database>,
  plaintextToken: string,
): Promise<{ link: EnrollmentLink; courseIds: string[] }> {
  const tokenHash = hashEnrollmentLinkToken(plaintextToken);
  const { data: link, error } = await admin
    .from("enrollment_links")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!link) throw new EnrollmentLinkError("INVALID_LINK", FRIENDLY_ERRORS.INVALID_LINK);

  const row = link as EnrollmentLink;

  if (row.deleted_at || row.status === "deleted" || row.status === "disabled" || row.status === "draft") {
    throw new EnrollmentLinkError("DISABLED", FRIENDLY_ERRORS.DISABLED);
  }

  if (row.status === "expired" || deriveExpired(row)) {
    if (row.status !== "expired") {
      await admin
        .from("enrollment_links")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
    throw new EnrollmentLinkError("EXPIRED", FRIENDLY_ERRORS.EXPIRED);
  }

  if (row.max_redemptions != null && row.current_redemptions >= row.max_redemptions) {
    throw new EnrollmentLinkError("LIMIT_REACHED", FRIENDLY_ERRORS.LIMIT_REACHED);
  }

  if (row.status !== "active") {
    throw new EnrollmentLinkError("DISABLED", FRIENDLY_ERRORS.DISABLED);
  }

  const { data: courses } = await admin
    .from("enrollment_link_courses")
    .select("course_id")
    .eq("enrollment_link_id", row.id);

  const courseIds = (courses ?? []).map((c) => c.course_id);
  if (courseIds.length === 0) {
    throw new EnrollmentLinkError("NO_COURSES", FRIENDLY_ERRORS.NO_COURSES);
  }

  return { link: row, courseIds };
}

export async function buildPublicLinkView(
  admin: SupabaseClient<Database>,
  link: EnrollmentLink,
  courseIds: string[],
): Promise<PublicLinkView> {
  const { data: courseRows } = await admin
    .from("courses")
    .select("id, title, description, thumbnail_url, certificate_enabled")
    .in("id", courseIds);

  const lessonCounts = new Map<string, number>();
  for (const courseId of courseIds) {
    const { data: modules } = await admin.from("modules").select("id").eq("course_id", courseId);
    const moduleIds = (modules ?? []).map((m) => m.id);
    if (moduleIds.length === 0) {
      lessonCounts.set(courseId, 0);
      continue;
    }
    const { count } = await admin
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .in("module_id", moduleIds);
    lessonCounts.set(courseId, count ?? 0);
  }

  const byId = new Map((courseRows ?? []).map((c) => [c.id, c]));
  const courses = courseIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      title: c!.title,
      description: c!.description,
      thumbnailUrl: c!.thumbnail_url,
      certificateEnabled: Boolean(c!.certificate_enabled),
      lessonCount: lessonCounts.get(c!.id) ?? 0,
    }));

  return {
    id: link.id,
    name: link.name,
    description: link.description,
    accessType: link.access_type,
    redirectType: link.redirect_type,
    redirectCourseId: link.redirect_course_id,
    courses,
  };
}

/** IMPORTED_STUDENTS: email must appear in bulk_import_rows (not every registered profile). */
export async function isImportedStudentEligible(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;

  try {
    const { data: imported } = await admin
      .from("bulk_import_rows")
      .select("id")
      .ilike("email", normalized)
      .limit(1)
      .maybeSingle();
    return Boolean(imported);
  } catch {
    return false;
  }
}

export function assertAccessType(
  access: EnrollmentLinkAccess,
  eligible: boolean,
) {
  if (access === "imported_students" && !eligible) {
    throw new EnrollmentLinkError("IMPORTED_ONLY", FRIENDLY_ERRORS.IMPORTED_ONLY);
  }
}

export type { EnrollmentLinkStatus };
