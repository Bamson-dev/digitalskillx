import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { runLiveWebinarFollowupDrain } from "@/lib/webinar-followup/live-drain";
import {
  continuationDepthFromRequest,
  scheduleBulkWorkerContinuation,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

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
    const result = await runLiveWebinarFollowupDrain(admin, { budgetMs: 100_000 });
    if (result.moreDue) {
      scheduleBulkWorkerContinuation({
        origin: "https://www.digitalskillx.com",
        path: "/api/cron/webinar-follow-up",
        depth,
        reason: "more_wfu_due",
      });
    }

    return NextResponse.json({ ok: true, depth, chained: result.moreDue, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
