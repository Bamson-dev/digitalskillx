import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { Profile } from "@/types/database";

/** Load or create the signed-in user's profile row (service role upsert when missing). */
export async function ensureStudentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  await supabase.auth.getSession();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  try {
    const admin = await createAdminClientAsync();
    const { data: existing } = await admin
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return existing;
  } catch {
    // fall through to upsert attempt
  }

  try {
    const admin = await createAdminClientAsync();
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    return profile;
  } catch {
    return null;
  }
}
