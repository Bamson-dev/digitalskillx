import { NextResponse, type NextRequest } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookSignature, verifyTransaction } from "@/lib/paystack";
import { fulfillPurchase } from "@/lib/purchase";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
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
  const verified = await verifyTransaction(reference);
  if (!verified || verified.status !== "success") {
    Sentry.captureMessage("Paystack webhook: verification failed", {
      level: "error",
      extra: { reference },
    });
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tx } = await admin
    .from("transactions")
    .select("student_id, course_id, status")
    .eq("reference", reference)
    .maybeSingle();

  if (!tx) {
    return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
  }

  if (!tx.student_id) {
    return NextResponse.json({ error: "Transaction has no student" }, { status: 400 });
  }

  if (tx.status === "success") {
    return NextResponse.json({ received: true, alreadyFulfilled: true });
  }

  await admin
    .from("transactions")
    .update({ paystack_data: event.data as unknown as Json })
    .eq("reference", reference);

  await fulfillPurchase({
    studentId: tx.student_id,
    courseId: tx.course_id,
    reference,
  });

  return NextResponse.json({ received: true });
}
