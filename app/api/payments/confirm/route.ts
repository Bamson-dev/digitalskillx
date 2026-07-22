import { NextResponse, type NextRequest } from "next/server";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import { completePaidCheckout, readPendingCheckoutDetails } from "@/lib/guest-checkout";
import { waitForSignedInCookies } from "@/lib/auth/wait-for-auth-cookies";
import {
  createRouteHandlerClientWithPendingCookies,
  jsonWithPendingCookies,
} from "@/lib/supabase/route-handler";
import {
  CHECKOUT_REF_COOKIE,
  checkoutRefCookieOptions,
  hashCheckoutBinding,
} from "@/lib/checkout-binding";

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
      .select("student_id, course_id, status, paystack_data")
      .eq("reference", reference)
      .maybeSingle();

    if (!tx) return jsonError("Payment record not found.", 404);

    if (body.courseId && tx.course_id !== body.courseId) {
      return jsonError("Payment does not match this course.", 400);
    }

    const pending: Parameters<typeof createRouteHandlerClientWithPendingCookies>[1] = [];
    const supabase = createRouteHandlerClientWithPendingCookies(request, pending);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const checkoutDetails = readPendingCheckoutDetails(tx.paystack_data);
    const bindingEmail =
      checkoutDetails.checkout_email ||
      (user?.email?.trim().toLowerCase() ?? "");
    const expectedBinding = bindingEmail
      ? hashCheckoutBinding(reference, bindingEmail)
      : null;
    const cookieBinding = request.cookies.get(CHECKOUT_REF_COOKIE)?.value ?? null;

    const ownsTx = Boolean(user && tx.student_id && tx.student_id === user.id);
    const checkoutCookieOk = Boolean(
      expectedBinding && cookieBinding && cookieBinding === expectedBinding,
    );

    // Guest confirm requires the browser cookie set at initialize (stops raw reference takeover).
    // Logged-in buyers of their own tx, or webhook-only success repair, still allowed when ownsTx.
    if (!ownsTx && !checkoutCookieOk && tx.status !== "success") {
      if (user && tx.student_id && tx.student_id !== user.id) {
        return jsonError("This payment belongs to another account.", 403);
      }
      if (!user) {
        return jsonError(
          "Confirm this payment from the same browser where you started checkout, or log in with the email used at payment.",
          403,
        );
      }
      // Logged-in user confirming a guest tx: allow only if email matches checkout email.
      const sessionEmail = user.email?.trim().toLowerCase() ?? "";
      if (
        !checkoutDetails.checkout_email ||
        sessionEmail !== checkoutDetails.checkout_email
      ) {
        return jsonError(
          "Log in with the email used at checkout to confirm this payment.",
          403,
        );
      }
    }

    if (user && tx.student_id && tx.student_id !== user.id && !checkoutCookieOk) {
      return jsonError("This payment belongs to another account.", 403);
    }

    const result = await completePaidCheckout(reference);

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    let sessionEstablished = false;
    if (!user && result.session) {
      const cookiesReady = waitForSignedInCookies(supabase, pending);
      const { error: sessionError } = await supabase.auth.setSession(result.session);
      if (!sessionError) {
        try {
          await cookiesReady;
          sessionEstablished = true;
        } catch (err) {
          console.error("[payments/confirm] cookie sync failed", err);
        }
      } else {
        console.error("[payments/confirm] setSession failed", sessionError.message);
      }
    }

    const payload = {
      enrolled: true,
      courseId: result.courseId,
      alreadyFulfilled: result.alreadyFulfilled ?? false,
      buyerEmail: result.buyerEmail ?? undefined,
      isNewAccount: result.isNewAccount ?? false,
      needsLogin: !user && !sessionEstablished,
      sessionEstablished,
    };

    const response =
      pending.length > 0
        ? jsonWithPendingCookies(pending, payload)
        : NextResponse.json(payload);

    // Clear checkout binding after successful confirm.
    response.cookies.set(CHECKOUT_REF_COOKIE, "", {
      ...checkoutRefCookieOptions(0),
      maxAge: 0,
    });

    return response;
  } catch (err) {
    console.error("[payments/confirm]", err);
    return jsonError(
      err instanceof Error ? err.message : "Could not confirm payment.",
      500,
    );
  }
}
