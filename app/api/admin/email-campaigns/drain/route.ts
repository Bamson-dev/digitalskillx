import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApiAuth } from "@/lib/admin-api-auth";
import { logAudit } from "@/lib/audit";
import { scheduleBulkWorkerContinuation } from "@/lib/bulk-import-continue";
import { enrollIfEmptyAndDrain, runLiveAimoneycodeDrain } from "@/lib/email-campaigns/live-drain";
import { loadCampaignSnapshot } from "@/lib/email-campaigns/store";
import { resendConfigured } from "@/lib/email/providers/resend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function kickIfMore(moreDue: boolean) {
  if (!moreDue) return;
  scheduleBulkWorkerContinuation({
    origin: "https://www.digitalskillx.com",
    path: "/api/cron/email-campaigns",
    reason: "admin_drain_more",
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiAuth();
  if ("error" in auth) return auth.error;
  if (!resendConfigured()) {
    return NextResponse.json({ error: "Resend is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const action = body.action === "start" ? "start" : "drain";

  const snapshot = await loadCampaignSnapshot(auth.admin);
  if (snapshot.migrationRequired || !snapshot.campaign) {
    return NextResponse.json({ error: "Campaign is not ready." }, { status: 400 });
  }

  try {
    if (action === "start") {
      const result = await enrollIfEmptyAndDrain({
        admin: auth.admin,
        campaign: snapshot.campaign,
        counts: snapshot.counts,
        enrollIfEmpty: snapshot.counts.total === 0,
        drain: true,
        budgetMs: 90_000,
      });
      await logAudit({
        action: "email_campaign_admin_drain_start",
        targetType: "email_campaign",
        targetId: snapshot.campaign.id,
        metadata: { inserted: result.inserted, sent: result.drain?.sent ?? 0 },
      });
      kickIfMore(Boolean(result.drain?.moreDue));
      return NextResponse.json({
        ok: true,
        inserted: result.inserted,
        sent: result.drain?.sent ?? 0,
        failed: result.drain?.failed ?? 0,
        examined: result.drain?.examined ?? 0,
        moreDue: Boolean(result.drain?.moreDue),
        dueNow: result.drain?.counts?.dueNow ?? snapshot.counts.dueNow,
        totalSent: result.drain?.counts?.sent ?? snapshot.counts.sent,
        reason: result.drain?.reason,
      });
    }

    const drain = await runLiveAimoneycodeDrain(auth.admin, {
      budgetMs: 90_000,
      campaignId: snapshot.campaign.id,
    });
    kickIfMore(drain.moreDue);
    return NextResponse.json({
      ok: true,
      inserted: 0,
      sent: drain.sent,
      failed: drain.failed,
      examined: drain.examined,
      moreDue: drain.moreDue,
      dueNow: drain.counts?.dueNow ?? 0,
      totalSent: drain.counts?.sent ?? 0,
      reason: drain.reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Drain failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
