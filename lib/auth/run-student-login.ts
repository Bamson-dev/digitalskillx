import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { Database } from "@/types/database";

export async function runStudentLogin(
  params: { email: string; password: string },
  supabase?: SupabaseClient<Database>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const email = params.email.trim().toLowerCase();
  const password = params.password;
  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const client = supabase ?? createClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  try {
    const admin = await createAdminClientAsync();
    const fullName =
      (data.user.user_metadata?.full_name as string | undefined) ??
      (data.user.user_metadata?.name as string | undefined) ??
      email.split("@")[0];

    const { error: upsertError } = await admin.from("profiles").upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role: "student",
        is_suspended: false,
      },
      { onConflict: "id" },
    );
    if (upsertError) throw new Error(upsertError.message);

    const { data: verified, error: verifyError } = await admin
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (verifyError) throw new Error(verifyError.message);
    if (!verified) throw new Error("Profile was not created.");
  } catch (err) {
    await client.auth.signOut();
    const message = err instanceof Error ? err.message : "Could not load your profile.";
    return { ok: false, error: message };
  }

  return { ok: true };
}
