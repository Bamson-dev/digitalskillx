import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  ensureAdminProfileSession,
  platformAdminProfileFromUser,
} from "@/lib/ensure-admin-profile-session";
import { checkStudentCourseEnrollment } from "@/lib/student-enrollments";
import type { Profile } from "@/types/database";

/** True when the signed-in user is a verified platform admin browsing student views. */
export async function isVerifiedAdminForStudentView(profile: Profile) {
  if (profile.role !== "admin" || profile.is_suspended) return false;

  const fromDb = await ensureAdminProfileSession();
  if (fromDb?.role === "admin" && !fromDb.is_suspended) return true;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  return Boolean(platformAdminProfileFromUser(user));
}

export type StudentViewSupabaseOptions = {
  /** When set, enrolled students read course content via service role (RLS-safe). */
  courseId?: string;
  /** Skip a second enrollment lookup when the caller already verified access. */
  enrolled?: boolean;
};

/**
 * Supabase client for student-facing course/lesson pages.
 * Admins previewing as students use the service role so draft/unpublished
 * content is readable even when RLS would block the session client.
 * Enrolled students also use the service role after access is verified server-side.
 */
export async function getStudentViewSupabase(
  profile: Profile,
  options?: StudentViewSupabaseOptions,
) {
  const session = createClient();

  if (await isVerifiedAdminForStudentView(profile)) {
    return createAdminClientAsync(session);
  }

  if (options?.courseId) {
    const enrolled =
      options.enrolled ??
      (await checkStudentCourseEnrollment(profile.id, options.courseId)).enrolled;
    if (enrolled) {
      return createAdminClientAsync(session);
    }
  }

  return session;
}
