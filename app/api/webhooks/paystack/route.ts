import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/paystack";
import { completePaidCheckout } from "@/lib/guest-checkout";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await bootstrapRuntimeSecrets();

  const limited = await rateLimitedResponse(request, "webhooks-paystack", 200);
  if (limited) return limited;

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    Sentry.captureMessage("Paystack webhook: invalid signature", { level: "warning" });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    event: string;
    data: { reference: string; status: string; metadata?: Record<string, string> };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  const reference = event.data.reference;

  const admin = await createAdminClientAsync();
  const { data: txBefore } = await admin
    .from("transactions")
    .select("status")
    .eq("reference", reference)
    .maybeSingle();

  if (txBefore?.status === "success") {
    return NextResponse.json({ received: true, alreadyFulfilled: true });
  }

  await admin
    .from("transactions")
    .update({ paystack_data: event.data as unknown as Json })
    .eq("reference", reference);

  const result = await completePaidCheckout(reference);

  if (!result.ok) {
    Sentry.captureMessage("Paystack webhook: fulfillment failed", {
      level: "error",
      extra: { reference, error: result.error },
    });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ received: true });
}
