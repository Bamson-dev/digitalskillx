import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendEmail } from "@/lib/email";
import { drainWebinarFollowupUntilBudget, type DrainResult } from "./processor";
import { createSupabaseWfuStore, loadCampaignCounts, type CampaignCounts } from "./store";

type Admin = SupabaseClient<Database>;

export function webinarFollowupSendMail() {
  return (mail: {
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  }) =>
    sendEmail({
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      headers: mail.headers,
      idempotencyKey: mail.idempotencyKey,
    });
}

export async function runLiveWebinarFollowupDrain(
  admin: Admin,
  opts?: { budgetMs?: number; campaignId?: string },
): Promise<DrainResult & { counts: CampaignCounts | null }> {
  const drain = await drainWebinarFollowupUntilBudget({
    store: createSupabaseWfuStore(admin),
    sendEmail: webinarFollowupSendMail(),
    limit: 40,
    budgetMs: opts?.budgetMs ?? 90_000,
    campaignId: opts?.campaignId,
  });
  const counts = opts?.campaignId ? await loadCampaignCounts(admin, opts.campaignId) : null;
  return { ...drain, counts };
}
