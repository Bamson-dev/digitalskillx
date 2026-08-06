import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

/**
 * Append-only enrollment domain events. Never updates existing rows.
 */
export async function recordEnrollmentEvent(
  admin: SupabaseClient<Database>,
  params: {
    event: string;
    enrollmentLinkId?: string | null;
    userId?: string | null;
    metadata?: Json;
    requestId?: string | null;
    correlationId?: string | null;
  },
) {
  try {
    await admin.from("enrollment_events").insert({
      event: params.event,
      enrollment_link_id: params.enrollmentLinkId ?? null,
      user_id: params.userId ?? null,
      metadata: params.metadata ?? {},
      request_id: params.requestId ?? null,
      correlation_id: params.correlationId ?? null,
    });
  } catch (err) {
    console.error("[enrollment-events]", err);
  }
}
