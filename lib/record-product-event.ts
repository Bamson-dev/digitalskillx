import "server-only";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { isMissingColumnError, isMissingRelationError } from "@/lib/schema-guard";
import type { Json } from "@/types/database";
import type { ProductEventName } from "@/lib/product-analytics";

/** Server-side product_events insert (purchase attribution, etc.). Fail-open. */
export async function recordProductEvent(params: {
  event: ProductEventName | string;
  courseId?: string | null;
  studentId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}): Promise<{ stored: boolean }> {
  try {
    const admin = await createAdminClientAsync();
    const metadata: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(params.metadata ?? {})) {
      if (v === undefined) continue;
      metadata[k] = v;
    }
    const { error } = await admin.from("product_events").insert({
      event_name: params.event,
      course_id: params.courseId ?? null,
      student_id: params.studentId ?? null,
      metadata: metadata as Json,
    });
    if (error) {
      if (isMissingRelationError(error.message) || isMissingColumnError(error.message)) {
        return { stored: false };
      }
      console.error("[recordProductEvent]", error.message);
      return { stored: false };
    }
    return { stored: true };
  } catch (err) {
    console.error("[recordProductEvent] unexpected", err);
    return { stored: false };
  }
}
