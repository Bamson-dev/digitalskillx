import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Append an admin action to the audit log (PRD §20). Best-effort: never throws
 * into the calling action.
 */
export async function logAudit(params: {
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Json;
}) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      admin_id: user?.id ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      metadata: params.metadata ?? {},
    });
  } catch {
    // swallow — auditing must not break the primary operation
  }
}
