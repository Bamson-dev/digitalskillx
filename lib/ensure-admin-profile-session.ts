import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { isPlatformAdminEmail } from "@/lib/admin-email";
import type { Profile } from "@/types/database";

/** Load or create the signed-in admin's profile (service role fallback when RLS read misses). */
export async function ensureAdminProfileSession(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (existing?.role === "admin" && !existing.is_suspended) return existing;

  if (!isPlatformAdminEmail(user.email)) return existing ?? null;

  try {
    const admin = await createAdminClientAsync();
    await ensureAdminProfile(admin, {
      userId: user.id,
      email: user.email.trim().toLowerCase(),
      fullName: (user.user_metadata?.full_name as string | undefined) ?? "Platform Admin",
    });
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return profile;
  } catch {
    return existing ?? null;
  }
}
