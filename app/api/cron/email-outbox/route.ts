import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { drainBulkImportEmailOutbox } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";
import {
  continuationDepthFromRequest,
  scheduleBulkWorkerContinuation,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Drain bulk-import email outbox. Auth: Bearer CRON_SECRET */
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
  const origin = new URL(request.url).origin;

  try {
    const result = await drainBulkImportEmailOutbox(admin, 40);
    // Full batch strongly suggests more pending rows in outbox
    const more = result.sent + result.failed >= 30;

    if (more) {
      scheduleBulkWorkerContinuation({
        origin,
        path: "/api/cron/email-outbox",
        depth,
        reason: "more_outbox",
      });
    }

    bulkImportStage("cron_email_outbox_tick", {
      ok: true,
      depth,
      chained: more,
      ...result,
    });
    return NextResponse.json({ ok: true, depth, chained: more, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bulkImportStage("cron_email_outbox_tick", { ok: false, error: message, depth });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
