import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fulfillPaystackExternalCharge } from "@/lib/paystack-external-fulfillment";
import { claimLeadthurHandoffNonce } from "@/lib/leadthur-handoff-nonce";
import {
  getLeadthurForwardSecret,
  isLeadthurForwardSecretConfigured,
  parseLeadthurHandoffPayload,
  readLeadthurHandoffHeaders,
  validateLeadthurHandoffPayment,
  verifyLeadthurHandoffSignature,
} from "@/lib/leadthur-handoff";
import { secureLog } from "@/lib/secure-log";
import type { Database } from "@/types/database";

type Admin = SupabaseClient<Database>;

function authFailure(reason: string) {
  secureLog("warn", "leadthur/handoff", "authentication_failed", { reason });
  return NextResponse.json({ error: "Unauthorized handoff" }, { status: 401 });
}

export async function handleLeadthurHandoffRequest(params: {
  rawBody: string;
  headers: { get(name: string): string | null };
  admin: Admin;
  nowSeconds?: number;
}) {
  secureLog("info", "leadthur/handoff", "handoff_received", {});

  if (!isLeadthurForwardSecretConfigured()) {
    secureLog("error", "leadthur/handoff", "authentication_failed", {
      reason: "not_configured",
    });
    return NextResponse.json({ error: "Handoff not configured" }, { status: 503 });
  }

  const secret = getLeadthurForwardSecret();
  const headerResult = readLeadthurHandoffHeaders(params.headers);
  if (!headerResult.ok) {
    return authFailure(headerResult.reason);
  }
  const headers = headerResult;

  const signatureCheck = verifyLeadthurHandoffSignature({
    secret,
    signature: headers.signature,
    timestamp: headers.timestamp,
    nonce: headers.nonce,
    body: params.rawBody,
    nowSeconds: params.nowSeconds,
  });
  if (!signatureCheck.valid) {
    return authFailure(signatureCheck.reason);
  }

  secureLog("info", "leadthur/handoff", "authentication_passed", {
    eventId: headers.eventId,
    productKey: headers.productKey,
  });

  const parsed = parseLeadthurHandoffPayload(params.rawBody);
  if (!parsed.ok) {
    secureLog("warn", "leadthur/handoff", "payment_rejected", {
      reason: parsed.error,
    });
    return NextResponse.json({ error: "Invalid handoff payload" }, { status: 422 });
  }

  const paymentCheck = validateLeadthurHandoffPayment({
    headerProductKey: headers.productKey,
    payload: parsed.payload,
  });
  if (!paymentCheck.ok) {
    secureLog("warn", "leadthur/handoff", paymentCheck.reason.includes("product") ? "product_rejected" : "payment_rejected", {
      reason: paymentCheck.reason,
      reference: parsed.payload.reference,
    });
    return NextResponse.json({ error: "Payment validation failed" }, { status: 422 });
  }

  const nonceClaim = await claimLeadthurHandoffNonce(params.admin, {
    nonce: headers.nonce,
    eventId: headers.eventId,
    productKey: headers.productKey,
    reference: parsed.payload.reference,
    now: params.nowSeconds ? new Date(params.nowSeconds * 1000) : undefined,
  });
  if (!nonceClaim.ok) {
    if (nonceClaim.reason === "replayed_nonce") {
      secureLog("warn", "leadthur/handoff", "replayed_nonce", {
        eventId: headers.eventId,
        reference: parsed.payload.reference,
      });
      return authFailure("replayed_nonce");
    }
    secureLog("error", "leadthur/handoff", "nonce_store_failed", {
      eventId: headers.eventId,
    });
    return NextResponse.json({ error: "Nonce store failed" }, { status: 500 });
  }

  const result = await fulfillPaystackExternalCharge({
    reference: parsed.payload.reference,
    webhookEvent: parsed.payload.event,
    admin: params.admin,
    handoffPayment: {
      productKey: paymentCheck.product.key,
      amount: parsed.payload.amount,
      currency: parsed.payload.currency,
      status: parsed.payload.status,
      customerEmail: parsed.payload.customer.email,
      paidAt: parsed.payload.paid_at,
      leadthurEventId: headers.eventId,
    },
  });

  if (!result.handled) {
    secureLog("warn", "leadthur/handoff", "payment_rejected", {
      reference: parsed.payload.reference,
      reason: "not_handled",
    });
    return NextResponse.json({ error: "Unhandled payment" }, { status: 422 });
  }

  if (!result.ok) {
    secureLog("error", "leadthur/handoff", "fulfillment_failed", {
      reference: parsed.payload.reference,
      error: result.error,
    });
    if (result.permanent || result.status === 200) {
      return NextResponse.json({ received: true, error: result.error }, { status: result.status });
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  if (result.alreadyFulfilled) {
    secureLog("info", "leadthur/handoff", "duplicate_fulfillment", {
      reference: result.reference,
    });
  } else {
    secureLog("info", "leadthur/handoff", "enrollment_created", {
      reference: result.reference,
      courseId: result.courseId,
    });
  }

  return NextResponse.json({
    received: true,
    enrolled: true,
    alreadyFulfilled: result.alreadyFulfilled ?? false,
    reference: result.reference,
    productKey: result.productKey,
    courseId: result.courseId,
  });
}
