import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getAdminSupabase } from "@/lib/admin-supabase";
import { resendConfigured } from "@/lib/email/providers/resend";
import { WebinarFollowupCampaignPanel } from "@/components/admin/webinar-followup-campaign-panel";
import {
  listContactsPage,
  listImports,
  listRecentSends,
  listSendsByStep,
  listSequenceSteps,
  loadCampaignSnapshot,
} from "@/lib/webinar-followup/store";

export const metadata: Metadata = { title: "Webinar Follow-Up Campaign" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export default async function WebinarFollowUpCampaignPage({
  params,
}: {
  params: { campaignId: string };
}) {
  const adminProfile = await requireAdmin();
  const admin = await getAdminSupabase();
  const snapshot = await loadCampaignSnapshot(admin, params.campaignId);
  if (!snapshot.campaign && !snapshot.migrationRequired) notFound();
  if (!snapshot.campaign) {
    return (
      <div className="space-y-4">
        <Link href="/admin/webinar-follow-up" className="text-sm text-brand-600 hover:underline">
          ← Back
        </Link>
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Migration 0048 is required before this campaign page can load.
        </p>
      </div>
    );
  }

  const campaign = snapshot.campaign;
  const [steps, imports, contacts, sends, sendsByStep] = await Promise.all([
    listSequenceSteps(admin, campaign.id),
    listImports(admin, campaign.id),
    listContactsPage(admin, campaign.id, 80),
    listRecentSends(admin, campaign.id, 50),
    listSendsByStep(admin, campaign.id),
  ]);

  return (
    <div className="space-y-4">
      <Link href="/admin/webinar-follow-up" className="text-sm text-brand-600 hover:underline">
        ← All webinar follow-up campaigns
      </Link>
      <WebinarFollowupCampaignPanel
        campaignId={campaign.id}
        campaignName={campaign.name}
        slug={campaign.slug}
        status={campaign.status}
        description={campaign.description}
        offerUrl={campaign.offer_url}
        offerPrice={campaign.offer_price_label}
        offerValue={campaign.offer_value_label}
        counts={snapshot.counts}
        steps={steps.map((s) => ({
          stepNumber: s.stepNumber,
          subject: s.subject,
          altSubjects: s.altSubjects,
          previewText: s.previewText,
          delayHours: s.delayHours,
          status: s.status,
          ctaLabel: s.ctaLabel,
          bodyText: s.bodyText,
          angle: s.angle,
          category: s.category,
          internalTitle: s.internalTitle,
        }))}
        imports={imports}
        contacts={contacts}
        sends={sends}
        sendsByStep={sendsByStep}
        adminEmail={adminProfile.email ?? ""}
        resendReady={resendConfigured()}
        migrationRequired={snapshot.migrationRequired}
      />
    </div>
  );
}
