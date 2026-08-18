"use server";

import { AIMONEYCODE_CAMPAIGN_SLUG } from "@/lib/email-campaigns/constants";
import { verifyUnsubscribeToken } from "@/lib/email-campaigns/unsubscribe";
import { suppressAndStopRecipient } from "@/lib/email-campaigns/store";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";

export type UnsubscribeState = { error?: string; ok?: boolean };

export async function confirmUnsubscribe(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const token = String(formData.get("token") ?? "").trim();
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed || parsed.campaignSlug !== AIMONEYCODE_CAMPAIGN_SLUG) {
    return { error: "This unsubscribe link is invalid." };
  }
  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  await suppressAndStopRecipient(admin, parsed.email, parsed.campaignSlug, "unsubscribe");
  return { ok: true };
}
