import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { scheduleBulkWorkerContinuation } from "@/lib/bulk-import-continue";
import { resendConfigured } from "@/lib/email/providers/resend";
import { runLiveWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import { loadCampaignSnapshot } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;
  if (!resendConfigured()) {
    return NextResponse.json({ error: "Resend is not configured." }, { status: 503 });
  }

  const snapshot = await loadCampaignSnapshot(auth.admin, params.campaignId);
  if (!snapshot.campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (snapshot.campaign.status !== "active") {
    return NextResponse.json(
      { error: "Campaign must be active before due emails can send." },
      { status: 409 },
    );
  }

  const drain = await runLiveWebinarFollowupDrain(auth.admin, {
    budgetMs: 90_000,
    campaignId: snapshot.campaign.id,
  });

  if (drain.moreDue) {
    scheduleBulkWorkerContinuation({
      origin: "https://www.digitalskillx.com",
      path: "/api/cron/webinar-follow-up",
      reason: "admin_wfu_drain_more",
    });
  }

  await logAudit({
    action: "webinar_followup_admin_drain",
    targetType: "webinar_followup_campaign",
    targetId: snapshot.campaign.id,
    metadata: { sent: drain.sent, failed: drain.failed, moreDue: drain.moreDue },
  });

  return NextResponse.json({
    ok: true,
    sent: drain.sent,
    failed: drain.failed,
    examined: drain.examined,
    queued: drain.queued,
    moreDue: drain.moreDue,
    dueNow: drain.counts?.dueNow ?? snapshot.counts.dueNow,
    totalSent: drain.counts?.sent ?? snapshot.counts.sent,
    reason: drain.reason,
  });
}
