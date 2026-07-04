import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { fetchPublishedCourseById } from "@/lib/published-courses";
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

    await bootstrapRuntimeSecrets();
    const admin = await createAdminClientAsync(supabase);

    const { data: profile } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", user.id)
      .single();
    if (!profile?.email) {
      return jsonError("Add an email address to your profile before enrolling.", 400);
    }

    const course = await fetchPublishedCourseById<{
      id: string;
      title: string;
      price_ngn: number;
      price_usd: number;
      visibility: string;
      enrollment_type: string;
    }>(body.courseId, "id, title, price_ngn, price_usd, visibility, enrollment_type");

    if (!course || course.visibility !== "published") {
      return jsonError("Course not available for enrollment.", 404);
    }

    if (course.enrollment_type !== "open") {
      return jsonError("This course requires admin enrollment. Contact support to join.", 403);
    }

    const { data: enrollment } = await admin
      .from("enrollments")
      .select("id")
      .eq("student_id", user.id)
      .eq("course_id", course.id)
      .maybeSingle();

    if (enrollment) {
      return NextResponse.json({ enrolled: true });
    }

    if (isCourseFree(course, "NGN")) {
      const { error: enrollError } = await admin.from("enrollments").insert({
        student_id: user.id,
        course_id: course.id,
        source: "self",
      });

      if (enrollError && !enrollError.message.toLowerCase().includes("duplicate")) {
        return jsonError(enrollError.message, 500);
      }

      const { sendWelcomeEmailIfNeeded } = await import("@/lib/system-email-triggers");
      void sendWelcomeEmailIfNeeded({
        studentId: user.id,
        fullName: profile.full_name ?? "there",
        email: profile.email,
        checkoutCourseId: course.id,
      });

      return NextResponse.json({ enrolled: true });
    }

    if (!(await paystackConfigured())) {
      return jsonError(
        "Paystack is not configured. Save your Paystack secret key under Admin → Settings → Integrations, then open any admin page once (or redeploy with PAYSTACK_SECRET_KEY in Coolify Runtime).",
        503,
      );
    }

    const chargeAmount = nairaToKobo(course.price_ngn);
    if (chargeAmount <= 0) {
      return jsonError("Course price is not set.", 400);
    }

    const reference = generateReference();

    const { error: txError } = await admin.from("transactions").insert({
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
    });

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
