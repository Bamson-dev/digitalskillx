import { createServiceClient, type DbClient } from "@/lib/db/client";
import { isDatabaseConfigured } from "@/lib/db/pool";

/**
 * Privileged database client. Connects as the database owner, so it BYPASSES
 * row level security. SERVER-ONLY. Never import this into a Client Component.
 */
export function createAdminClient(): DbClient {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured");
  }
  return createServiceClient();
}

/** Kept for call-site compatibility; there is no key to resolve any more. */
export async function createAdminClientAsync(_supabase?: unknown): Promise<DbClient> {
  return createAdminClient();
}

export function isServiceRoleConfigured() {
  return isDatabaseConfigured();
}
