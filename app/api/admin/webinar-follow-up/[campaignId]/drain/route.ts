import { NextResponse, type NextRequest } from "next/server";
import { runBackgroundTask } from "@/lib/background-tasks";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { keepWebinarFollowupSending } from "@/lib/bulk-import-continue";
import { marketingEmailConfigured } from "@/lib/email/provider";
import { WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS } from "@/lib/webinar-followup/constants";
import { kickWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import { loadCampaignSnapshot } from "@/lib/webinar-followup/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Admin "Send due emails now" — return immediately so the browser does not 504.
 * Heavy draining continues in-process; durable campaign rows are resumed by cron.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { campaignId: string } },
) {
  const auth = await requireAdminApiAuth({ lite: true });
  if ("error" in auth) return auth.error;
  if (!marketingEmailConfigured()) {
    return NextResponse.json({ error: "Marketing email provider is not connected. Connect Zoho Campaigns or another marketing email service before sending." }, { status: 503 });
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

  runBackgroundTask(
    (async () => {
      try {
        const drain = await kickWebinarFollowupDrain(auth.admin, {
          budgetMs: WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS,
          campaignId,
          reason: "admin_wfu_drain",
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
    "webinar-followup-admin-drain",
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
