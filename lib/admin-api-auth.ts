import "server-only";
import { NextResponse } from "next/server";
import { ensureAdminProfileSession, platformAdminProfileFromUser } from "@/lib/ensure-admin-profile-session";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { Profile } from "@/types/database";

type AdminApiAuth =
  | {
      user: { id: string; email?: string | null };
      profile: Profile;
      admin: SupabaseClient<Database>;
      session: SupabaseClient<Database>;
    }
  | { error: NextResponse };

/**
 * Admin auth for JSON API routes — never redirects (redirect breaks fetch clients).
 * Uses service-role fallbacks when RLS blocks profile reads.
 */
export async function requireAdminApiAuth(): Promise<AdminApiAuth> {
  const session = createClient();
  await session.auth.getSession();
  const {
    data: { user },
  } = await session.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const profile =
    (await ensureAdminProfileSession()) ?? platformAdminProfileFromUser(user);

  if (!profile || profile.role !== "admin" || profile.is_suspended) {
    return {
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync(session);

  return { user, profile, admin, session };
}
