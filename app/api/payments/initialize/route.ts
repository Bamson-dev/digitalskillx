import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initializeTransaction, generateReference, paystackConfigured } from "@/lib/paystack";
import { isCourseFree, nairaToKobo, type CurrencyCode } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { rateLimitedResponse } from "@/lib/api-rate-limit";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: NextRequest) {
  try {
    const limited = await rateLimitedResponse(request, "payments-initialize", 30);
    if (limited) return limited;

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError("Please sign in to enroll.", 401);

    let body: { courseId?: string; currency?: CurrencyCode };
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid request body.", 400);
    }

    if (!body.courseId) {
      return jsonError("courseId is required", 400);
    }

    const requestedCurrency: CurrencyCode = body.currency === "USD" ? "USD" : "NGN";
    if (requestedCurrency === "USD") {
      return jsonError("USD payments are not available yet", 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();
    if (!profile?.email) {
      return jsonError("Add an email address to your profile before enrolling.", 400);
    }

    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("id, title, price_ngn, price_usd, visibility, enrollment_type")
      .eq("id", body.courseId)
      .single();

    if (courseError || !course || course.visibility !== "published") {
      return jsonError("Course not available for enrollment.", 404);
    }

    if (course.enrollment_type !== "open") {
      return jsonError("This course requires admin enrollment. Contact support to join.", 403);
    }

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();

    if (enrollment) {
      return NextResponse.json({ enrolled: true });
    }

    if (isCourseFree(course, "NGN")) {
      const { error: enrollError } = await supabase.from("enrollments").insert({
        student_id: user.id,
        course_id: course.id,
        source: "self",
      });

      if (enrollError && !enrollError.message.toLowerCase().includes("duplicate")) {
        return jsonError(enrollError.message, 500);
      }

      return NextResponse.json({ enrolled: true });
    }

    if (!(await paystackConfigured(supabase))) {
      return jsonError(
        "Paystack is not configured. Save your secret key under Admin → Settings → Integrations, or set PAYSTACK_SECRET_KEY in Coolify (runtime only) and redeploy.",
        503,
      );
    }

    const chargeAmount = nairaToKobo(course.price_ngn);
    if (chargeAmount <= 0) {
      return jsonError("Course price is not set.", 400);
    }

    const reference = generateReference();

    const { error: txError } = await supabase.from("transactions").insert({
      student_id: user.id,
      course_id: course.id,
      amount: chargeAmount,
      currency: "NGN",
      reference,
      status: "pending",
    });

    if (txError) {
      if (txError.message.includes("does not exist")) {
        return jsonError(
          "Payments database is not set up. Run sql/transactions-student-checkout.sql in Supabase.",
          503,
        );
      }
      if (txError.message.toLowerCase().includes("policy")) {
        return jsonError(
          "Checkout is blocked by database permissions. Run sql/transactions-student-checkout.sql in Supabase.",
          503,
        );
      }
      return jsonError(txError.message, 500);
    }

    const init = await initializeTransaction({
      email: profile.email,
      amountMinor: chargeAmount,
      currency: "NGN",
      reference,
      callbackUrl: `${siteUrl()}/course/${course.id}?payment=success`,
      metadata: {
        student_id: user.id,
        course_id: course.id,
        currency: "NGN",
      },
    }, supabase);

    return NextResponse.json({
      authorizationUrl: init.authorization_url,
      reference,
    });
  } catch (err) {
    console.error("[payments/initialize]", err);
    return jsonError(
      err instanceof Error ? err.message : "Payment could not start. Please try again.",
      500,
    );
  }
}
