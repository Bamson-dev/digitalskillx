import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClientAsync } from "@/lib/supabase/admin";
import { bootstrapRuntimeSecrets } from "@/lib/bootstrap-runtime-secrets";
import { fetchPublishedCourseById } from "@/lib/published-courses";
import { initializeTransaction, generateReference, paystackConfigured } from "@/lib/paystack";
import { isCourseFree, nairaToKobo, type CurrencyCode } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { rateLimitedResponse } from "@/lib/api-rate-limit";
import {
  resolveOrCreateStudentForPurchase,
} from "@/lib/guest-checkout";
import { isValidStudentEmail, syncStudentCourseAccess, findProfileByEmail } from "@/lib/admin-student-onboarding";
import { sendWelcomeEmailIfNeeded } from "@/lib/system-email-triggers";
import { CHECKOUT_REF_COOKIE, checkoutRefCookieOptions, hashCheckoutBinding } from "@/lib/checkout-binding";
import { runAutomations } from "@/lib/automation";
import { secureLog } from "@/lib/secure-log";

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

    let body: { courseId?: string; currency?: CurrencyCode; email?: string; fullName?: string };
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

    let profile: { email: string; full_name: string | null } | null = null;
    if (user) {
      const { data: p } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", user.id)
        .single();
      profile = p;
    }

    const course = await fetchPublishedCourseById<{
      id: string;
      title: string;
      price_ngn: number;
      price_usd: number;
      visibility: string;
      enrollment_type: string;
      is_coming_soon: boolean;
    }>(body.courseId, "id, title, price_ngn, price_usd, visibility, enrollment_type, is_coming_soon");

    if (!course || course.visibility !== "published") {
      return jsonError("Course not available for enrollment.", 404);
    }

    if (course.is_coming_soon) {
      return jsonError("This course is coming soon. Enrollment opens when content is ready.", 403);
    }

    if (course.enrollment_type !== "open") {
      return jsonError("This course requires admin enrollment. Contact support to join.", 403);
    }

    const studentIdForEnrollment = user?.id ?? null;
    let canonicalStudentId = studentIdForEnrollment;

    if (studentIdForEnrollment) {
      try {
        canonicalStudentId = await syncStudentCourseAccess(admin, {
          authUserId: studentIdForEnrollment,
          profileEmail: profile?.email,
        });
      } catch (err) {
        console.error("[payments/initialize] syncStudentCourseAccess failed", err);
        canonicalStudentId = studentIdForEnrollment;
      }

      const { data: enrollment } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", canonicalStudentId)
        .eq("course_id", course.id)
        .maybeSingle();

      if (enrollment) {
        return NextResponse.json({ enrolled: true });
      }
    }

    if (isCourseFree(course, "NGN")) {
      if (canonicalStudentId) {
        const { error: enrollError } = await admin.from("enrollments").insert({
          student_id: canonicalStudentId,
          course_id: course.id,
          source: "self",
        });

        if (enrollError && !enrollError.message.toLowerCase().includes("duplicate")) {
          return jsonError(enrollError.message, 500);
        }

        try {
          await runAutomations("course_enrolled", {
            studentId: canonicalStudentId,
            courseId: course.id,
          });
        } catch (err) {
          console.error("[payments/initialize] free enroll automation", err);
        }

        if (profile?.email) {
          void sendWelcomeEmailIfNeeded({
            studentId: canonicalStudentId,
            fullName: profile.full_name ?? "there",
            email: profile.email,
            checkoutCourseId: course.id,
          });
        }

        return NextResponse.json({ enrolled: true });
      }

      const guestEmail = body.email?.trim().toLowerCase() ?? "";
      const guestName = body.fullName?.trim() ?? "";
      if (!isValidStudentEmail(guestEmail)) {
        return jsonError("Enter your email address to enroll in this free course.", 400);
      }
      if (guestName.length < 2) {
        return jsonError("Enter your full name to enroll.", 400);
      }

      const resolved = await resolveOrCreateStudentForPurchase(admin, {
        email: guestEmail,
        fullName: guestName,
      });

      const { data: existingEnrollment } = await admin
        .from("enrollments")
        .select("id")
        .eq("student_id", resolved.studentId)
        .eq("course_id", course.id)
        .maybeSingle();

      if (!existingEnrollment) {
        const { error: enrollError } = await admin.from("enrollments").insert({
          student_id: resolved.studentId,
          course_id: course.id,
          source: "self",
        });
        if (enrollError && !enrollError.message.toLowerCase().includes("duplicate")) {
          return jsonError(enrollError.message, 500);
        }
        try {
          await runAutomations("course_enrolled", {
            studentId: resolved.studentId,
            courseId: course.id,
          });
        } catch (err) {
          console.error("[payments/initialize] free guest automation", err);
        }
      }

      void sendWelcomeEmailIfNeeded({
        studentId: resolved.studentId,
        fullName: resolved.fullName,
        email: resolved.email,
        password: resolved.password,
        checkoutCourseId: course.id,
      });

      return NextResponse.json({
        enrolled: true,
        isNewAccount: resolved.isNewAccount,
        buyerEmail: resolved.email,
      });
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

    let checkoutEmail = profile?.email?.trim().toLowerCase() ?? "";
    let checkoutName = profile?.full_name?.trim() ?? "";

    if (!checkoutEmail && body.email?.trim()) {
      checkoutEmail = body.email.trim().toLowerCase();
      checkoutName = body.fullName?.trim() ?? checkoutName;
    }

    if (!studentIdForEnrollment || !profile?.email) {
      if (!isValidStudentEmail(checkoutEmail)) {
        return jsonError("Enter your email address before checkout.", 400);
      }
      if (checkoutName.length < 2) {
        return jsonError("Enter your full name before checkout.", 400);
      }
    } else if (!checkoutEmail) {
      return jsonError("Add an email address to your profile before enrolling.", 400);
    }

    // Guest / email path: block double-charge when already enrolled under that email.
    if (isValidStudentEmail(checkoutEmail)) {
      const existingProfile = await findProfileByEmail(admin, checkoutEmail);
      if (existingProfile) {
        let enrollStudentId = existingProfile.id;
        try {
          enrollStudentId = await syncStudentCourseAccess(admin, {
            authUserId: existingProfile.id,
            profileEmail: checkoutEmail,
          });
        } catch (err) {
          console.error("[payments/initialize] guest sync before paid", err);
        }
        const { data: alreadyEnrolled } = await admin
          .from("enrollments")
          .select("id")
          .eq("student_id", enrollStudentId)
          .eq("course_id", course.id)
          .maybeSingle();
        if (alreadyEnrolled) {
          return NextResponse.json({ enrolled: true, buyerEmail: checkoutEmail });
        }
      }
    }

    const reference = generateReference();
    const storeCheckoutDetails = !studentIdForEnrollment || !profile?.email;

    const { error: txError } = await admin.from("transactions").insert({
      student_id: studentIdForEnrollment,
      course_id: course.id,
      amount: chargeAmount,
      currency: "NGN",
      reference,
      status: "pending",
      ...(storeCheckoutDetails
        ? {
            paystack_data: {
              checkout_email: checkoutEmail,
              checkout_full_name: checkoutName,
            },
          }
        : {}),
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

    const metadata: Record<string, string> = {
      course_id: course.id,
      currency: "NGN",
      buyer_email: checkoutEmail,
      buyer_full_name: checkoutName,
    };
    if (studentIdForEnrollment) {
      metadata.student_id = studentIdForEnrollment;
    }

    let init;
    try {
      init = await initializeTransaction({
        email: checkoutEmail,
        amountMinor: chargeAmount,
        currency: "NGN",
        reference,
        callbackUrl: `${siteUrl()}/course/${course.id}?payment=success`,
        metadata,
        customerName: checkoutName,
      });
    } catch (err) {
      await admin
        .from("transactions")
        .update({ status: "failed" })
        .eq("reference", reference)
        .eq("status", "pending");
      throw err;
    }

    const response = NextResponse.json({
      authorizationUrl: init.authorization_url,
      reference,
    });
    response.cookies.set(
      CHECKOUT_REF_COOKIE,
      hashCheckoutBinding(reference, checkoutEmail),
      checkoutRefCookieOptions(),
    );
    return response;
  } catch (err) {
    secureLog("error", "payments/initialize", "initialize failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonError(
      err instanceof Error ? err.message : "Payment could not start. Please try again.",
      500,
    );
  }
}
