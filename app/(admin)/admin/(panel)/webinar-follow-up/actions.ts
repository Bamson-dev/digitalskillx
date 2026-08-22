"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { isSyntheticTestRecipient } from "@/lib/email/synthetic-recipient";
import { listUnsubscribeHeader, unsubscribeUrl } from "@/lib/email-campaigns/unsubscribe";
import { scheduleBulkWorkerContinuation } from "@/lib/bulk-import-continue";
import {
  isAuthorizedTestRecipient,
  isValidEmail,
  normalizeEmail,
  WEBINAR_FOLLOWUP_REQUIRED_STEPS,
  WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION,
  type CampaignStatus,
} from "@/lib/webinar-followup/constants";
import { renderWebinarFollowupEmail } from "@/lib/webinar-followup/render";
import { buildSoftwareWithAiSequence } from "@/lib/webinar-followup/sequence-seed";
import { assertValidWebinarSequence } from "@/lib/webinar-followup/validate-sequence";
import { runLiveWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import {
  listSequenceSteps,
  seedSequenceSteps,
  setCampaignStatus,
} from "@/lib/webinar-followup/store";

export type WfuActionState = { error?: string; message?: string };

export async function setWebinarCampaignStatusAction(
  _prev: WfuActionState,
  formData: FormData,
): Promise<WfuActionState> {
  try {
    await requireAdmin();
    const admin = await getAdminSupabase();
    const campaignId = String(formData.get("campaign_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim() as CampaignStatus;
    if (!campaignId) return { error: "Missing campaign." };
    if (!["draft", "active", "paused", "archived"].includes(status)) {
      return { error: "Invalid status." };
    }

    const steps = await listSequenceSteps(admin, campaignId);
    const activeSteps = steps.filter((s) => s.status === "active");
    if (status === "active") {
      if (activeSteps.length !== WEBINAR_FOLLOWUP_REQUIRED_STEPS) {
        return {
          error: `Load the full ${WEBINAR_FOLLOWUP_REQUIRED_STEPS}-email sequence before activating (found ${activeSteps.length} steps).`,
        };
      }
      const numbers = activeSteps.map((s) => s.stepNumber).sort((a, b) => a - b);
      for (let i = 0; i < WEBINAR_FOLLOWUP_REQUIRED_STEPS; i++) {
        if (numbers[i] !== i + 1) {
          return { error: "Sequence steps must be ordered 1 through 40 with no gaps before activation." };
        }
      }
    }

    await setCampaignStatus(admin, campaignId, status);
    await logAudit({
      action: "webinar_followup_status",
      targetType: "webinar_followup_campaign",
      targetId: campaignId,
      metadata: { status },
    });

    if (status === "active") {
      await runLiveWebinarFollowupDrain(admin, { budgetMs: 20_000, campaignId });
      scheduleBulkWorkerContinuation({
        origin: "https://www.digitalskillx.com",
        path: "/api/cron/webinar-follow-up",
        depth: 0,
        reason: "wfu_campaign_activated",
      });
    }

    revalidatePath("/admin/webinar-follow-up");
    revalidatePath(`/admin/webinar-follow-up/${campaignId}`);

    const labels: Record<CampaignStatus, string> = {
      draft: "Campaign set to draft. No emails will send.",
      active:
        "Campaign activated. New contacts start at Email 1. Existing contacts continue from their current step. Sending runs on the server.",
      paused: "Campaign paused. Progress is preserved. No further emails will send until you resume.",
      archived: "Campaign archived. Sending and new imports are blocked.",
    };
    return { message: labels[status] };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update status." };
  }
}

export async function seedWebinarSequenceAction(
  _prev: WfuActionState,
  formData: FormData,
): Promise<WfuActionState> {
  try {
    await requireAdmin();
    const admin = await getAdminSupabase();
    const campaignId = String(formData.get("campaign_id") ?? "").trim();
    if (!campaignId) return { error: "Missing campaign." };
    const existing = await listSequenceSteps(admin, campaignId);
    if (existing.length > 0 && formData.get("force") !== "1") {
      return {
        error: `Sequence already has ${existing.length} steps. Use force only if you intend to re-upsert.`,
      };
    }
    const emails = assertValidWebinarSequence(buildSoftwareWithAiSequence());
    const n = await seedSequenceSteps(admin, campaignId, emails);
    await logAudit({
      action: "webinar_followup_seed_sequence",
      targetType: "webinar_followup_campaign",
      targetId: campaignId,
      metadata: { steps: n, sourceVersion: WEBINAR_FOLLOWUP_SEQUENCE_SOURCE_VERSION },
    });
    revalidatePath(`/admin/webinar-follow-up/${campaignId}`);
    return {
      message: `Loaded ${n} emails into the campaign. Review them anytime. Nothing is sending until you activate.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not seed sequence." };
  }
}

export async function testSendWebinarFollowupEmail(
  _prev: WfuActionState,
  formData: FormData,
): Promise<WfuActionState> {
  try {
    const adminProfile = await requireAdmin();
    const admin = await getAdminSupabase();
    const campaignId = String(formData.get("campaign_id") ?? "").trim();
    const step = Number(formData.get("step") ?? 0);
    const to = normalizeEmail(String(formData.get("test_email") ?? ""));
    if (!campaignId) return { error: "Missing campaign." };
    if (!Number.isInteger(step) || step < 1) return { error: "Choose a valid sequence step." };
    if (!isValidEmail(to)) return { error: "Enter a valid email address." };
    if (isSyntheticTestRecipient(to)) {
      return { error: "Synthetic cert+ addresses are blocked because they bounce." };
    }
    if (!isAuthorizedTestRecipient(to, adminProfile.email ?? "")) {
      return {
        error:
          "Test sends are restricted to your admin email, the same email domain, any Gmail address, or WEBINAR_FOLLOWUP_TEST_EMAILS.",
      };
    }

    const steps = await listSequenceSteps(admin, campaignId);
    const email = steps.find((s) => s.stepNumber === step);
    if (!email) return { error: `Step ${step} is not loaded yet. Load the sequence first.` };

    const { data: campaign } = await admin
      .from("webinar_followup_campaigns" as never)
      .select("slug")
      .eq("id", campaignId)
      .maybeSingle();
    const slug = String((campaign as { slug?: string } | null)?.slug ?? "webinar-followup");

    const unsub = unsubscribeUrl(to, slug);
    const rendered = renderWebinarFollowupEmail({
      email,
      firstName: null,
      campaignSlug: slug,
      unsubscribeUrl: unsub,
    });

    const result = await sendEmail({
      to,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      headers: unsub ? listUnsubscribeHeader(unsub) : undefined,
      idempotencyKey: `wfu-test:${adminProfile.id}:${campaignId}:${step}:${Date.now()}`,
    });

    if ("error" in result && result.error && !("messageId" in result)) {
      return {
        error: result.error instanceof Error ? result.error.message : "Test send failed.",
      };
    }

    await logAudit({
      action: "webinar_followup_test_send",
      targetType: "webinar_followup_campaign",
      targetId: campaignId,
      metadata: { step, to },
    });
    revalidatePath(`/admin/webinar-follow-up/${campaignId}`);
    return {
      message: `Test Email ${step} sent to ${to}. Did not enroll anyone or advance campaign progress.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Test send failed." };
  }
}
