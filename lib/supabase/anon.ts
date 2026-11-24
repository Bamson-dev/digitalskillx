import { createAnonDbClient, type DbClient } from "@/lib/db/client";

/** Cookie-less client for public ISR pages. Row level security applies as the anon role. */
export function createAnonClient(): DbClient {
  return createAnonDbClient();
}
