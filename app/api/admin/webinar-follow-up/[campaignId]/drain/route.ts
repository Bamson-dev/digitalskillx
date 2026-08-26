import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { keepWebinarFollowupSending } from "@/lib/bulk-import-continue";
import { resendConfigured } from "@/lib/email/providers/resend";
import { runLiveWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import { loadCampaignSnapshot } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Admin "Send due emails now" — return immediately so the browser does not 504.
 * Heavy draining continues via waitUntil + cron self-chain.
 */
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

  const campaignId = snapshot.campaign.id;
  const dueNow = snapshot.counts.dueNow ?? 0;
  const sending = snapshot.counts.sending ?? 0;
  const moreDue = dueNow > 0 || sending > 0;

  // Kick cron chain first — works even if this request is cut short by the proxy.
  keepWebinarFollowupSending({
    moreDue: true,
    reason: "admin_wfu_kick",
  });

  waitUntil(
    (async () => {
      try {
        const drain = await runLiveWebinarFollowupDrain(auth.admin, {
          budgetMs: 55_000,
          campaignId,
        });
        keepWebinarFollowupSending({
          moreDue:
            drain.moreDue || (drain.counts?.dueNow ?? 0) > 0 || (drain.counts?.sending ?? 0) > 0,
          reason: "admin_wfu_drain_more",
        });
        await logAudit({
          action: "webinar_followup_admin_drain",
          targetType: "webinar_followup_campaign",
          targetId: campaignId,
          metadata: { sent: drain.sent, failed: drain.failed, moreDue: drain.moreDue },
        });
      } catch (err) {
        console.error("[wfu-admin-drain] background drain failed:", err);
        keepWebinarFollowupSending({
          moreDue: true,
          reason: "admin_wfu_drain_error",
        });
      }
    })(),
  );

  return NextResponse.json({
    ok: true,
    kicked: true,
    sent: 0,
    failed: 0,
    examined: 0,
    queued: 0,
    moreDue,
    dueNow,
    totalSent: snapshot.counts.sent,
    sentToday: snapshot.counts.sentToday,
    reason: "kicked",
  });
}
