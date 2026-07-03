import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Ensure profiles row exists with role=admin (update alone fails if row missing). */
export async function ensureAdminProfile(
  admin: SupabaseClient<Database>,
  params: { userId: string; email: string; fullName?: string },
) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: params.userId,
      email: params.email,
      full_name: params.fullName ?? "Platform Admin",
      role: "admin",
      is_suspended: false,
    },
    { onConflict: "id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}
