import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendEmail } from "@/lib/email";
import { nudgeWebinarFollowupIfNeeded } from "@/lib/bulk-import-continue";
import { drainWebinarFollowupUntilBudget, type DrainResult } from "./processor";
import { createSupabaseWfuStore, ensureSequenceFromSource, loadCampaignCounts, type CampaignCounts } from "./store";

type Admin = SupabaseClient<Database>;

/** Peek active campaigns and kick the auto-drain chain if anything is waiting. */
export async function nudgeWebinarFollowupFromCron(
  admin: Admin,
  reason: string,
): Promise<{ dueNow: number; sending: number; nudged: boolean }> {
  const store = createSupabaseWfuStore(admin);
  let dueNow = 0;
  let sending = 0;
  try {
    const campaigns = await store.listActiveCampaigns();
    for (const campaign of campaigns) {
      const counts = await loadCampaignCounts(admin, campaign.id);
      dueNow += counts.dueNow;
      sending += counts.sending;
    }
  } catch {
    return { dueNow: 0, sending: 0, nudged: false };
  }
  const nudged = dueNow > 0 || sending > 0;
  if (nudged) {
    nudgeWebinarFollowupIfNeeded({ dueNow, sending, reason });
  }
  return { dueNow, sending, nudged };
}

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
): Promise<DrainResult & { counts: CampaignCounts | null; sequenceSynced?: boolean }> {
  const store = createSupabaseWfuStore(admin);
  let sequenceSynced = false;
  if (opts?.campaignId) {
    sequenceSynced = await ensureSequenceFromSource(admin, opts.campaignId);
  } else {
    const campaigns = await store.listActiveCampaigns();
    for (const campaign of campaigns) {
      if (await ensureSequenceFromSource(admin, campaign.id)) sequenceSynced = true;
    }
  }

  const drain = await drainWebinarFollowupUntilBudget({
    store,
    sendEmail: webinarFollowupSendMail(),
    limit: 60,
    budgetMs: opts?.budgetMs ?? 90_000,
    campaignId: opts?.campaignId,
  });
  let leftover = false;
  let counts: CampaignCounts | null = null;
  if (opts?.campaignId) {
    counts = await loadCampaignCounts(admin, opts.campaignId);
    leftover = counts.sending > 0 || counts.dueNow > 0;
  } else {
    const campaigns = await store.listActiveCampaigns();
    for (const campaign of campaigns) {
      const c = await loadCampaignCounts(admin, campaign.id);
      if (c.sending > 0 || c.dueNow > 0) leftover = true;
    }
  }
  return {
    ...drain,
    counts,
    sequenceSynced,
    moreDue: drain.moreDue || leftover,
  };
}
