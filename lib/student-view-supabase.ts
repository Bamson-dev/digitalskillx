import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  ensureAdminProfileSession,
  platformAdminProfileFromUser,
} from "@/lib/ensure-admin-profile-session";
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

/**
 * Supabase client for student-facing course/lesson pages.
 * Admins previewing as students use the service role so draft/unpublished
 * content is readable even when RLS would block the session client.
 */
export async function getStudentViewSupabase(profile: Profile) {
  if (await isVerifiedAdminForStudentView(profile)) {
    return createAdminClientAsync(createClient());
  }
  return createClient();
}
