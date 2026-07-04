import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { completePaidCheckout } from "@/lib/guest-checkout";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Confirm a Paystack payment after browser redirect (fallback when webhook is delayed). */
export async function POST(request: NextRequest) {
  try {
    await bootstrapRuntimeSecrets();

    const limited = await rateLimitedResponse(request, "payments-confirm", 30);
    if (limited) return limited;

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

    if (body.courseId && tx.course_id !== body.courseId) {
      return jsonError("Payment does not match this course.", 400);
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user && tx.student_id && tx.student_id !== user.id) {
      return jsonError("This payment belongs to another account.", 403);
    }

    const result = await completePaidCheckout(reference);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return NextResponse.json({
      enrolled: true,
      courseId: result.courseId,
      alreadyFulfilled: result.alreadyFulfilled ?? false,
      buyerEmail: result.buyerEmail ?? undefined,
      isNewAccount: result.isNewAccount ?? false,
      needsLogin: !user && !result.session,
      session: result.session,
    });
  } catch (err) {
    console.error("[payments/confirm]", err);
    return jsonError(
      err instanceof Error ? err.message : "Could not confirm payment.",
      500,
    );
  }
}
