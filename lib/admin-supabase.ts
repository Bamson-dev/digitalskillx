import "server-only";
import { requireAdmin } from "@/lib/auth";
import { ensureAdminProfileSession } from "@/lib/ensure-admin-profile-session";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";

/**
 * Service-role Supabase client for admin panel writes.
 * Ensures admin auth before bypassing RLS.
 */
export async function getAdminSupabase() {
  await requireAdmin();
  await ensureAdminProfileSession();
  await bootstrapRuntimeSecrets();
  return createAdminClientAsync(createClient());
}
