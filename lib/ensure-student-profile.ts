import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, createAdminClientAsync } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

async function serviceRoleClient() {
  try {
    return createAdminClient();
  } catch {
    return createAdminClientAsync();
  }
}

/** Load or create the signed-in user's profile row (service role upsert when missing). */
export async function ensureStudentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  try {
    const admin = await serviceRoleClient();
    const { data: existing } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return existing;

    const email = user.email.trim().toLowerCase();
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      email.split("@")[0];

    const { error } = await admin.from("profiles").upsert(
      {
        id: user.id,
        email,
        full_name: fullName,
        role: "student",
        is_suspended: false,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);

    const { data: profile } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return profile;
  } catch {
    return null;
  }
}

/** Fallback student profile when DB read fails but auth session is valid. */
export function studentProfileFromUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
}): Profile | null {
  const email = user.email?.trim().toLowerCase();
  if (!email) return null;
  const now = new Date().toISOString();
  return {
    id: user.id,
    email,
    full_name:
      (user.user_metadata?.full_name as string | undefined) ??
      (user.user_metadata?.name as string | undefined) ??
      email.split("@")[0],
    role: "student",
    is_suspended: false,
    avatar_url: null,
    tags: [],
    last_active_at: null,
    welcome_email_sent_at: null,
    created_at: now,
    updated_at: now,
  };
}
