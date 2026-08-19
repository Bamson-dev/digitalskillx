import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { sendEmail } from "@/lib/email";
import { drainAimoneycodeCampaignUntilBudget, type CampaignRecord, type DrainResult } from "@/lib/email-campaigns/processor";
import {
  createSupabaseCampaignStore,
  enrollCandidates,
  loadCampaignCounts,
  previewStudents,
  setCampaignStatus,
  type CampaignCounts,
} from "@/lib/email-campaigns/store";

type Admin = SupabaseClient<Database>;

export function campaignSendMail() {
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

export async function runLiveAimoneycodeDrain(
  admin: Admin,
  opts?: { budgetMs?: number; campaignId?: string },
): Promise<DrainResult & { counts: CampaignCounts | null }> {
  const drain = await drainAimoneycodeCampaignUntilBudget({
    store: createSupabaseCampaignStore(admin),
    sendEmail: campaignSendMail(),
    limit: 40,
    budgetMs: opts?.budgetMs ?? 90_000,
  });
  const counts = opts?.campaignId ? await loadCampaignCounts(admin, opts.campaignId) : null;
  return { ...drain, counts };
}

export async function enrollIfEmptyAndDrain(params: {
  admin: Admin;
  campaign: CampaignRecord;
  counts: CampaignCounts;
  enrollIfEmpty: boolean;
  drain: boolean;
  budgetMs?: number;
}): Promise<{ inserted: number; drain: (DrainResult & { counts: CampaignCounts | null }) | null }> {
  let inserted = 0;
  if (params.enrollIfEmpty && params.counts.total === 0) {
    const preview = await previewStudents(params.admin, params.campaign.id);
    inserted = await enrollCandidates(params.admin, params.campaign.id, preview.selected);
  }
  if (params.campaign.status !== "active") {
    await setCampaignStatus(params.admin, params.campaign.id, "active");
  }
  if (!params.drain) return { inserted, drain: null };
  const drain = await runLiveAimoneycodeDrain(params.admin, {
    budgetMs: params.budgetMs,
    campaignId: params.campaign.id,
  });
  return { inserted, drain };
}
