"use server";

import { AIMONEYCODE_CAMPAIGN_SLUG } from "@/lib/email-campaigns/constants";
import { verifyUnsubscribeToken } from "@/lib/email-campaigns/unsubscribe";
import { suppressAndStopRecipient } from "@/lib/email-campaigns/store";
import { suppressWebinarContact } from "@/lib/webinar-followup/store";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";

export type UnsubscribeState = { error?: string; ok?: boolean };

async function isWebinarFollowupSlug(
  admin: Awaited<ReturnType<typeof createAdminClientAsync>>,
  slug: string,
): Promise<boolean> {
  const { data } = await admin
    .from("webinar_followup_campaigns" as never)
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return Boolean(data);
}

export async function confirmUnsubscribe(
  _prev: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const token = String(formData.get("token") ?? "").trim();
  const parsed = verifyUnsubscribeToken(token);
  if (!parsed) {
    return { error: "This unsubscribe link is invalid." };
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();

  if (parsed.campaignSlug === AIMONEYCODE_CAMPAIGN_SLUG) {
    await suppressAndStopRecipient(admin, parsed.email, parsed.campaignSlug, "unsubscribe");
    return { ok: true };
  }

  if (await isWebinarFollowupSlug(admin, parsed.campaignSlug)) {
    await suppressWebinarContact(admin, parsed.email, parsed.campaignSlug, "unsubscribe");
    return { ok: true };
  }

  return { error: "This unsubscribe link is invalid." };
}
