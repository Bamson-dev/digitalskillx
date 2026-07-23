import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { drainBulkImportEmailOutbox } from "@/lib/bulk-import-email-outbox";
import { bulkImportStage } from "@/lib/bulk-import-telemetry";

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
  try {
    const result = await drainBulkImportEmailOutbox(admin, 50);
    bulkImportStage("cron_email_outbox_tick", { ok: true, ...result });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    bulkImportStage("cron_email_outbox_tick", { ok: false, error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
