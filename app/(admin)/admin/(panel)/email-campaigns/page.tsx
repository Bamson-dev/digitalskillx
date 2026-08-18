import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { EmailCampaignPanel } from "@/components/admin/email-campaign-panel";
import { loadCampaignSnapshot } from "@/lib/email-campaigns/store";
import { loadAimoneycodeSequence } from "@/lib/email-campaigns/sequence";
import { ctaUrlForStep } from "@/lib/email-campaigns/constants";
import { resendConfigured } from "@/lib/email/providers/resend";

export const metadata: Metadata = { title: "Email campaigns" };

export default async function AdminEmailCampaignsPage() {
  const adminProfile = await requireAdmin();
  const admin = await getAdminSupabase();
  const snapshot = await loadCampaignSnapshot(admin);
  const emails = loadAimoneycodeSequence().map((email) => ({
    day: email.day,
    subject: email.subject,
    previewText: email.previewText,
    ctaLink: ctaUrlForStep(email.day),
    body: email.body,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Email campaigns</h1>
        <p className="mt-1 text-sm text-muted">
          AI Money Code 30-day sequence. Server-side sending only. The campaign stays draft until
          you activate it.
        </p>
      </div>
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
