import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

/** Keep nonces long enough to block replay beyond the freshness window. */
export const LEADTHUR_NONCE_RETENTION_SECONDS = 86_400;

export type ClaimNonceResult =
  | { ok: true }
  | { ok: false; reason: "replayed_nonce" | "store_failed" };

export async function claimLeadthurHandoffNonce(
  admin: Admin,
  params: {
    nonce: string;
    eventId: string;
    productKey: string;
    reference?: string | null;
    now?: Date;
  },
): Promise<ClaimNonceResult> {
  const now = params.now ?? new Date();
  const expiresAt = new Date(now.getTime() + LEADTHUR_NONCE_RETENTION_SECONDS * 1000);

  await admin
    .from("leadthur_handoff_nonces")
    .delete()
    .lt("expires_at", now.toISOString());

  const { error } = await admin.from("leadthur_handoff_nonces").insert({
    nonce: params.nonce,
    event_id: params.eventId,
    product_key: params.productKey,
    reference: params.reference ?? null,
    expires_at: expiresAt.toISOString(),
  });

  if (!error) return { ok: true };

  const message = error.message.toLowerCase();
  if (message.includes("duplicate") || message.includes("unique")) {
    return { ok: false, reason: "replayed_nonce" };
  }

  return { ok: false, reason: "store_failed" };
}
