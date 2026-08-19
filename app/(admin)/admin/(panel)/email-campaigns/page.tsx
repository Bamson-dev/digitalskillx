import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { EmailCampaignPanel } from "@/components/admin/email-campaign-panel";
import { loadCampaignSnapshot } from "@/lib/email-campaigns/store";
import { loadAimoneycodeSequence } from "@/lib/email-campaigns/sequence";
import { ctaUrlForStep } from "@/lib/email-campaigns/constants";
import { resendConfigured } from "@/lib/email/providers/resend";

export const metadata: Metadata = { title: "Email campaigns" };
export const maxDuration = 120;

export default async function AdminEmailCampaignsPage() {
  const adminProfile = await requireAdmin();
  const admin = await getAdminSupabase();

  let loadError: string | null = null;
  let snapshot;
  let emails: Array<{
    day: number;
    subject: string;
    previewText: string;
    ctaLink: string;
    body: string;
  }> = [];

  try {
    snapshot = await loadCampaignSnapshot(admin);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Could not load the campaign.";
    snapshot = {
      migrationRequired: /schema cache|does not exist|could not find the table/i.test(loadError),
      campaign: null,
      counts: {
        total: 0,
        active: 0,
        completed: 0,
        unsubscribed: 0,
        failed: 0,
        waiting: 0,
        dueNow: 0,
        sent: 0,
        sendFailed: 0,
        nextScheduledAt: null,
      },
    };
  }

  try {
    emails = loadAimoneycodeSequence().map((email) => ({
      day: email.day,
      subject: email.subject,
      previewText: email.previewText,
      ctaLink: ctaUrlForStep(email.day),
      body: email.body,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load campaign emails.";
    loadError = loadError ? `${loadError} ${message}` : message;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          AI Money Code 30-day sequence. Choose the student list and click Start. Emails send from
          the server — you can close this page.
        </p>
      </div>
      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}
      <EmailCampaignPanel
        campaignName={snapshot.campaign?.name ?? "AI Money Code 30-Day Email Sequence"}
        status={snapshot.campaign?.status ?? "draft"}
        migrationRequired={snapshot.migrationRequired || !snapshot.campaign}
        counts={snapshot.counts}
        emails={emails}
        adminEmail={adminProfile.email}
        resendReady={resendConfigured()}
      />
    </div>
  );
}
