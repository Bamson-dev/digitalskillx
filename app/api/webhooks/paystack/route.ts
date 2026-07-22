import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { verifyWebhookSignature } from "@/lib/paystack";
import { completePaidCheckout, readPendingCheckoutDetails } from "@/lib/guest-checkout";
import { ensurePurchaseEnrollment } from "@/lib/purchase";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { secureLog } from "@/lib/secure-log";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  await bootstrapRuntimeSecrets();

  const limited = await rateLimitedResponse(request, "webhooks-paystack", 200);
  if (limited) return limited;

  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    secureLog("warn", "webhooks/paystack", "invalid signature");
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

  const reference = event.data?.reference;
  const admin = await createAdminClientAsync();

  if (event.event === "charge.failed" || event.event === "charge.abandoned") {
    if (reference) {
      await admin
        .from("transactions")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending");
    }
    return NextResponse.json({ received: true });
  }

  if (event.event !== "charge.success") {
    return NextResponse.json({ received: true });
  }

  if (!reference) {
    return NextResponse.json({ received: true });
  }

  const { data: txBefore } = await admin
    .from("transactions")
    .select("status, paystack_data, student_id, course_id")
    .eq("reference", reference)
    .maybeSingle();

  if (txBefore?.status === "success") {
    if (txBefore.student_id && txBefore.course_id) {
      try {
        await ensurePurchaseEnrollment({
          studentId: txBefore.student_id,
          courseId: txBefore.course_id,
        });
      } catch (err) {
        console.error("[webhooks/paystack] enrollment repair", reference, err);
      }
    }
    return NextResponse.json({ received: true, alreadyFulfilled: true });
  }

  const pendingCheckout = readPendingCheckoutDetails(txBefore?.paystack_data);
  await admin
    .from("transactions")
    .update({
      paystack_data: {
        ...(event.data as Record<string, unknown>),
        ...(pendingCheckout.checkout_email
          ? { checkout_email: pendingCheckout.checkout_email }
          : {}),
        ...(pendingCheckout.checkout_full_name
          ? { checkout_full_name: pendingCheckout.checkout_full_name }
          : {}),
      } as unknown as Json,
    })
    .eq("reference", reference);

  const result = await completePaidCheckout(reference);

  if (!result.ok) {
    secureLog("error", "webhooks/paystack", "fulfillment failed", {
      reference,
      status: result.status,
      error: result.error,
    });
    Sentry.captureMessage("Paystack webhook: fulfillment failed", {
      level: "error",
      extra: { reference, error: result.error, status: result.status },
    });
    // Permanent business failures → 200 so Paystack stops retrying forever.
    const statusCode = Number(result.status);
    const permanent =
      ("permanent" in result && Boolean(result.permanent)) ||
      statusCode === 404 ||
      statusCode === 422;
    if (permanent) {
      return NextResponse.json({ received: true, error: result.error });
    }
    return NextResponse.json({ error: result.error }, { status: statusCode });
  }

  return NextResponse.json({ received: true });
}
