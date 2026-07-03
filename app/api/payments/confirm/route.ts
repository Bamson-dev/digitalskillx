import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { verifyTransaction } from "@/lib/paystack";
import { fulfillPurchase } from "@/lib/purchase";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Confirm a Paystack payment after browser redirect (fallback when webhook is delayed). */
export async function POST(request: NextRequest) {
  try {
    await bootstrapRuntimeSecrets();

    const limited = await rateLimitedResponse(request, "payments-confirm", 30);
    if (limited) return limited;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError("Please sign in to confirm your payment.", 401);

    let body: { reference?: string; courseId?: string };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    const reference = String(body.reference ?? "").trim();
    if (!reference) return jsonError("Payment reference is required.", 400);

    const admin = await createAdminClientAsync();
    const { data: tx } = await admin
      .from("transactions")
      .select("student_id, course_id, status")
      .eq("reference", reference)
      .maybeSingle();

    if (!tx) return jsonError("Payment record not found.", 404);
    if (tx.student_id !== user.id) return jsonError("This payment belongs to another account.", 403);

    if (body.courseId && tx.course_id !== body.courseId) {
      return jsonError("Payment does not match this course.", 400);
    }

    if (tx.status === "success") {
      return NextResponse.json({
        enrolled: true,
        courseId: tx.course_id,
        alreadyFulfilled: true,
      });
    }

    const verified = await verifyTransaction(reference);
    if (!verified || verified.status !== "success") {
      return jsonError(
        "Payment is still processing. Refresh in a moment or check your email for confirmation.",
        409,
      );
    }

    await fulfillPurchase({
      studentId: tx.student_id,
      courseId: tx.course_id,
      reference,
    });

    return NextResponse.json({
      enrolled: true,
      courseId: tx.course_id,
    });
  } catch (err) {
    console.error("[payments/confirm]", err);
    return jsonError(
      err instanceof Error ? err.message : "Could not confirm payment.",
      500,
    );
  }
}
