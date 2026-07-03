import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";

/** Validates a Supabase access token and returns the auth user, or null. */
export async function verifyAccessToken(accessToken: string) {
  if (!accessToken.trim()) return null;
  const admin = await createAdminClientAsync();
  const {
    data: { user },
    error,
  } = await admin.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
}
