import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminMfaStatus, isAdminMfaRequired } from "@/lib/admin-mfa";
import type { Profile } from "@/types/database";

/** Returns the current user's profile, or null if signed out. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data ?? null;
}

/** Guards a student route. Redirects to /login when not authenticated. */
export async function requireStudent(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.is_suspended) redirect("/login?error=account_suspended");
  // Admins can also browse student views, so no role rejection here.
  void touchLastActive(profile);
  return profile;
}

/** Throttled last-active heartbeat (updates at most hourly) for inactivity rules. */
async function touchLastActive(profile: Profile) {
  try {
    const last = profile.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
    if (Date.now() - last < 3600000) return;
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ last_active_at: new Date().toISOString() })
      .eq("id", profile.id);
  } catch {
    // non-critical
  }
}

/** Guards an admin route. Redirects to /admin/login for non-admins (PRD §4.3). */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/admin/login");
  if (profile.role !== "admin" || profile.is_suspended) {
    redirect("/admin/login?error=forbidden");
  }

  const mfa = await getAdminMfaStatus();
  if (isAdminMfaRequired()) {
    if (!mfa.enrolled) redirect("/admin/mfa/enroll");
    if (!mfa.verified) redirect("/admin/login");
  }

  return profile;
}

/** Admin auth without MFA gate (login / MFA enrollment pages). */
export async function requireAdminPasswordOnly(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/admin/login");
  if (profile.role !== "admin" || profile.is_suspended) {
    redirect("/admin/login?error=forbidden");
  }
  return profile;
}
