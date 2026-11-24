import { NextResponse, type NextRequest } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { secureLog } from "@/lib/secure-log";
import { verifySvixSignature } from "@/lib/payment-recovery/svix";
import { buildRecoveryDeps } from "@/lib/payment-recovery/server";
import { handleResendEvent } from "@/lib/payment-recovery/engine";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resend delivery webhook (Svix-signed). Records delivery, bounce, complaint and
 * suppression events for payment recovery emails. Secret: RESEND_WEBHOOK_SECRET.
 */
export async function POST(request: NextRequest) {
  await bootstrapRuntimeSecrets();
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });

  const body = await request.text();
  const id = request.headers.get("svix-id");
  const ok = verifySvixSignature({
    secret,
    id,
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
    body,
  });
  if (!ok) {
    secureLog("warn", "webhooks/resend", "invalid_signature", {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let evt: { type?: string; created_at?: string; data?: Record<string, unknown> };
  try {
    evt = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { db, deps } = await buildRecoveryDeps();
  // Idempotency: one row per Svix message id.
  const seen = await db
    .from("payment_recovery_webhook_events")
    .insert({ id: String(id), provider: "resend", event_type: String(evt.type ?? "unknown") });
  if (seen.error) {
    if (/duplicate/i.test(seen.error.message ?? "") || seen.error.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ error: "Could not record event." }, { status: 500 });
  }
  try {
    const result = await handleResendEvent(db, deps, evt as Parameters<typeof handleResendEvent>[2]);
    return NextResponse.json({ received: true, handled: result.handled });
  } catch (err) {
    // Let Resend retry: forget the id so the retry is not treated as a duplicate.
    await db.from("payment_recovery_webhook_events").delete().eq("id", String(id));
    secureLog("error", "webhooks/resend", "handle_failed", { error: err instanceof Error ? err.message.slice(0, 160) : "error" });
    return NextResponse.json({ error: "Retry later." }, { status: 500 });
  }
}
