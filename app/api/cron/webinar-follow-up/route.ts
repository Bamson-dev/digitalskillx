import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import {
  nudgeWebinarFollowupFromCron,
  runLiveWebinarFollowupDrain,
} from "@/lib/webinar-followup/live-drain";
import { WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS } from "@/lib/webinar-followup/constants";
import {
  continuationDepthFromRequest,
  keepWebinarFollowupSending,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Leave headroom for waitUntil continuation retries after the drain. */
const DRAIN_BUDGET_MS = WEBINAR_FOLLOWUP_DRAIN_BUDGET_MS - 15_000;

export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const auth = verifyCronSecret(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await bootstrapRuntimeSecrets();
  const admin = await createAdminClientAsync();
  const depth = continuationDepthFromRequest(request);

  try {
    // Peek + kick before draining so a timeout mid-drain does not leave
    // due emails idle until the next scheduled cron.
    const peek = await nudgeWebinarFollowupFromCron(
      admin,
      depth === 0 ? "wfu_cron_bootstrap" : "wfu_cron_continue_peek",
    );

    const result = await runLiveWebinarFollowupDrain(admin, {
      budgetMs: DRAIN_BUDGET_MS,
    });
    keepWebinarFollowupSending({
      moreDue: result.moreDue,
      depth,
      reason: "more_wfu_due",
    });

    return NextResponse.json({
      ok: true,
      depth,
      chained: result.moreDue,
      peek,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    keepWebinarFollowupSending({
      moreDue: true,
      depth,
      reason: "wfu_drain_error",
    });
    return NextResponse.json({ ok: false, error: message, depth }, { status: 500 });
  }
}
