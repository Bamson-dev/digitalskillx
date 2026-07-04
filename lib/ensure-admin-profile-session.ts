import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createAdminClientAsync } from "@/lib/supabase/admin";
import { ensureAdminProfile } from "@/lib/ensure-admin-profile";
import { isPlatformAdminEmail } from "@/lib/admin-email";
import type { Profile } from "@/types/database";

async function serviceRoleClient() {
  try {
    return createAdminClient();
  } catch {
    return createAdminClientAsync();
  }
}

/** Load admin profile via service role (RLS-safe) for authenticated admin routes. */
export async function ensureAdminProfileSession(): Promise<Profile | null> {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  try {
    const admin = await serviceRoleClient();
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

/** Fallback profile when DB read fails but Supabase auth session is valid. */
export function platformAdminProfileFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): Profile | null {
  const email = user.email?.trim().toLowerCase();
  if (!email || !isPlatformAdminEmail(email)) return null;
  const now = new Date().toISOString();
  return {
    id: user.id,
    email,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? "Platform Admin",
    role: "admin",
    is_suspended: false,
    avatar_url: null,
    tags: [],
    last_active_at: null,
    welcome_email_sent_at: null,
    created_at: now,
    updated_at: now,
  };
}
