"use server";

import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { logAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { AIMONEYCODE_CAMPAIGN_SLUG, AIMONEYCODE_TOTAL_STEPS } from "@/lib/email-campaigns/constants";
import {
  authorizedCampaignTestAddresses,
  isAuthorizedCampaignTestAddress,
} from "@/lib/email-campaigns/selection";
import { getAimoneycodeEmail } from "@/lib/email-campaigns/sequence";
import { renderCampaignEmailHtml } from "@/lib/email-campaigns/render";
import { listUnsubscribeHeader, unsubscribeUrl } from "@/lib/email-campaigns/unsubscribe";
import { processAimoneycodeCampaignTick } from "@/lib/email-campaigns/processor";
import {
  createSupabaseCampaignStore,
  enrollCandidates,
  loadCampaignSnapshot,
  previewBuyers,
  previewCsv,
  previewStudents,
  setCampaignStatus,
} from "@/lib/email-campaigns/store";
import { resendConfigured } from "@/lib/email/providers/resend";

export type CampaignActionState = {
  error?: string;
  message?: string;
  preview?: {
    source: string;
    selected: number;
    skippedSynthetic: number;
    skippedInvalid: number;
    skippedDuplicate: number;
    skippedSuppressed: number;
    skippedAlreadyEnrolled: number;
    unmatchedCsv: number;
  };
};

async function requireCampaign() {
  await requireAdmin();
  const admin = await getAdminSupabase();
  const snapshot = await loadCampaignSnapshot(admin);
  if (snapshot.migrationRequired) {
    throw new Error("Apply migration 0046_email_campaigns.sql before using this campaign.");
  }
  if (!snapshot.campaign) {
    throw new Error("AI Money Code campaign row is missing. Re-run migration 0046.");
  }
  return { admin, campaign: snapshot.campaign };
}

export async function previewCampaignRecipients(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  try {
    const { admin, campaign } = await requireCampaign();
    const source = String(formData.get("source") ?? "");
    const csvText = String(formData.get("csv_text") ?? "");
    const preview =
      source === "buyers"
        ? await previewBuyers(admin, campaign.id)
        : source === "students"
          ? await previewStudents(admin, campaign.id)
          : source === "csv"
            ? await previewCsv(admin, campaign.id, csvText)
            : null;
    if (!preview) return { error: "Choose buyers, enrolled students, or a CSV list." };

    await logAudit({
      action: "email_campaign_preview",
      targetType: "email_campaign",
      targetId: campaign.id,
      metadata: { source, selected: preview.selected.length, dryRun: true },
    });

    return {
      message: `Dry-run only — no emails sent. ${preview.selected.length} recipient(s) would be enrolled.`,
      preview: {
        source: preview.source,
        selected: preview.selected.length,
        skippedSynthetic: preview.skippedSynthetic,
        skippedInvalid: preview.skippedInvalid,
        skippedDuplicate: preview.skippedDuplicate,
        skippedSuppressed: preview.skippedSuppressed,
        skippedAlreadyEnrolled: preview.skippedAlreadyEnrolled,
        unmatchedCsv: preview.unmatchedCsv,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Preview failed." };
  }
}

export async function enrollCampaignRecipients(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  try {
    const { admin, campaign } = await requireCampaign();
    const source = String(formData.get("source") ?? "");
    const csvText = String(formData.get("csv_text") ?? "");
    const preview =
      source === "buyers"
        ? await previewBuyers(admin, campaign.id)
        : source === "students"
          ? await previewStudents(admin, campaign.id)
          : source === "csv"
            ? await previewCsv(admin, campaign.id, csvText)
            : null;
    if (!preview) return { error: "Choose buyers, enrolled students, or a CSV list." };
    if (preview.selected.length === 0) {
      return { error: "No new eligible recipients to enroll. Run a dry-run preview first." };
    }

    const inserted = await enrollCandidates(admin, campaign.id, preview.selected);

    await logAudit({
      action: "email_campaign_enroll",
      targetType: "email_campaign",
      targetId: campaign.id,
      metadata: { source, attempted: preview.selected.length, inserted, campaignStatus: campaign.status },
    });

    if (campaign.status === "active") {
      await processAimoneycodeCampaignTick({
        store: createSupabaseCampaignStore(admin),
        sendEmail: (mail) =>
          sendEmail({
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            headers: mail.headers,
            idempotencyKey: mail.idempotencyKey,
          }),
      });
    }

    return {
      message:
        campaign.status === "active"
          ? `Enrolled ${inserted} recipient(s). Email 1 will send for newly enrolled people because the campaign is active.`
          : `Enrolled ${inserted} recipient(s). Campaign is still draft — nothing will send until you activate it.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Enrollment failed." };
  }
}

export async function setAimoneycodeCampaignStatus(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  try {
    const { admin, campaign } = await requireCampaign();
    const status = String(formData.get("status") ?? "");
    if (status !== "draft" && status !== "active" && status !== "paused") {
      return { error: "Invalid campaign status." };
    }
    if (status === "active" && !resendConfigured()) {
      return { error: "Resend is not configured. Set RESEND_API_KEY before activating." };
    }

    await setCampaignStatus(admin, campaign.id, status);
    await logAudit({
      action: "email_campaign_status",
      targetType: "email_campaign",
      targetId: campaign.id,
      metadata: { from: campaign.status, to: status },
    });

    if (status === "active") {
      await processAimoneycodeCampaignTick({
        store: createSupabaseCampaignStore(admin),
        sendEmail: (mail) =>
          sendEmail({
            to: mail.to,
            subject: mail.subject,
            html: mail.html,
            headers: mail.headers,
            idempotencyKey: mail.idempotencyKey,
          }),
      });
    }

    const label =
      status === "active"
        ? "Campaign activated. Eligible Email 1s will send from the server."
        : status === "paused"
          ? "Campaign paused. No further sequence emails will send."
          : "Campaign set back to draft. Sending is blocked.";
    return { message: label };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not update campaign status." };
  }
}

export async function testSendAimoneycodeEmail(
  _prev: CampaignActionState,
  formData: FormData,
): Promise<CampaignActionState> {
  try {
    const adminProfile = await requireAdmin();
    await requireCampaign();
    const step = Number(formData.get("step") ?? 0);
    const to = String(formData.get("test_email") ?? "").trim();
    if (!Number.isInteger(step) || step < 1 || step > AIMONEYCODE_TOTAL_STEPS) {
      return { error: "Choose Email 1 through Email 30." };
    }

    const allowed = authorizedCampaignTestAddresses({
      adminEmail: adminProfile.email,
    });
    if (!isAuthorizedCampaignTestAddress(to, allowed)) {
      return {
        error:
          "Test sends are limited to your admin email or EMAIL_CAMPAIGN_TEST_ADDRESSES. Customer addresses are blocked.",
      };
    }

    const email = getAimoneycodeEmail(step);
    const unsub = unsubscribeUrl(to, AIMONEYCODE_CAMPAIGN_SLUG);
    const rendered = renderCampaignEmailHtml({
      email,
      stepNumber: step,
      fullName: adminProfile.full_name,
      unsubscribeUrl: unsub,
    });

    const result = await sendEmail({
      to,
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      headers: unsub ? listUnsubscribeHeader(unsub) : undefined,
      idempotencyKey: `aimc-test:${adminProfile.id}:${step}:${Date.now()}`,
    });

    if ("error" in result) {
      return { error: result.error instanceof Error ? result.error.message : "Test send failed." };
    }

    await logAudit({
      action: "email_campaign_test_send",
      targetType: "email_campaign",
      metadata: { step, to },
    });

    return { message: `Test Email ${step} sent to ${to}. This did not enroll or advance any campaign recipient.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Test send failed." };
  }
}
