import "server-only";
import { ensureStorageBuckets } from "@/lib/ensure-storage-buckets";
import { createAdminClientAsync } from "@/lib/supabase/admin";

/** Service-role storage client for admin uploads (bypasses RLS; auto-creates buckets). */
export async function getAdminStorageClient() {
  await ensureStorageBuckets();
  return createAdminClientAsync();
}
