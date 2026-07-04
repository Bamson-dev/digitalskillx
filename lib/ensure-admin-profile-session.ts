import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { isPlatformAdminEmail } from "@/lib/admin-email";
import type { Profile } from "@/types/database";

/** Load admin profile via service role (RLS-safe) for authenticated admin routes. */
export async function ensureAdminProfileSession(): Promise<Profile | null> {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  try {
    const admin = await createAdminClientAsync();
    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role === "admin" && !profile.is_suspended) return profile;

    if (!isPlatformAdminEmail(user.email)) return profile ?? null;

    await ensureAdminProfile(admin, {
      userId: user.id,
      email: user.email.trim().toLowerCase(),
      fullName: (user.user_metadata?.full_name as string | undefined) ?? "Platform Admin",
    });

    const { data: healed } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return healed;
  } catch {
    return null;
  }
}
