import { NextResponse, type NextRequest } from "next/server";
import { verifyCronSecret } from "@/lib/cron-auth";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { drainAimoneycodeCampaignUntilBudget } from "@/lib/email-campaigns/processor";
import { createSupabaseCampaignStore } from "@/lib/email-campaigns/store";
import {
  continuationDepthFromRequest,
  scheduleBulkWorkerContinuation,
} from "@/lib/bulk-import-continue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

function campaignMailer() {
  return (mail: {
    to: string;
    subject: string;
    html: string;
    headers?: Record<string, string>;
    idempotencyKey?: string;
  }) =>
    sendEmail({
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      headers: mail.headers,
      idempotencyKey: mail.idempotencyKey,
    });
}

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
    const result = await drainAimoneycodeCampaignUntilBudget({
      store: createSupabaseCampaignStore(admin),
      sendEmail: campaignMailer(),
      limit: 40,
      budgetMs: 100_000,
    });

    if (result.moreDue) {
      scheduleBulkWorkerContinuation({
        origin: "https://www.digitalskillx.com",
        path: "/api/cron/email-campaigns",
        depth,
        reason: "more_campaign_due",
      });
    }

    return NextResponse.json({ ok: true, depth, chained: result.moreDue, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
