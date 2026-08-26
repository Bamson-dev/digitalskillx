import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { initializeTransaction, generateReference, paystackConfigured, paystackUsdEnabled } from "@/lib/paystack";
import { nairaToKobo } from "@/lib/currency";
import { siteUrl } from "@/lib/org";
import { isValidStudentEmail, findProfileByEmail } from "@/lib/admin-student-onboarding";
import { CHECKOUT_REF_COOKIE, checkoutRefCookieOptions, hashCheckoutBinding } from "@/lib/checkout-binding";
import { isMissingColumnError } from "@/lib/schema-guard";
import {
  buildLearningPathCheckoutPayload,
  issueLearningPathCertificate,
  loadPublishedPathCertificateOffer,
} from "@/lib/learn-certificates";
import { resolveOrCreateStudentForPurchase } from "@/lib/guest-checkout";
import {
  assertLearningPathFullyComplete,
  createLearnDeviceKey,
  LEARN_DEVICE_COOKIE,
  readLearnDeviceKeyFromCookieStore,
} from "@/lib/learn-progress";
import {
  learnCertificateUsdFromNgn,
  learnCertificateUsdToCents,
} from "@/lib/learn-certificate-pricing";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function initializeLearningPathCertificateCheckout(params: {
  admin: SupabaseClient<Database>;
  userId: string | null;
  profile: { email: string; full_name: string | null } | null;
  body: {
    learningPathId: string;
    email?: string;
    fullName?: string;
    completedLessonNumbers?: string[];
    currency?: "NGN" | "USD";
  };
}) {
  const path = await loadPublishedPathCertificateOffer(params.admin, params.body.learningPathId);
  if (!path) {
    return jsonError("This learning path does not offer a paid certificate.", 404);
  }

  let deviceKey = readLearnDeviceKeyFromCookieStore();
  let setDeviceCookie = false;
  if (!params.userId && !deviceKey) {
    deviceKey = createLearnDeviceKey();
    setDeviceCookie = true;
  }

  const completion = await assertLearningPathFullyComplete({
    admin: params.admin,
    pathId: path.id,
    studentId: params.userId,
    deviceKey: params.userId ? null : deviceKey,
    clientLessonNumbers: params.body.completedLessonNumbers,
  });
  if (!completion.ok) {
    return jsonError(completion.error, 403);
  }

  const priceNgn = path.certificate_price_ngn ?? 0;
  const requestedCurrency = params.body.currency === "USD" ? "USD" : "NGN";
  if (requestedCurrency === "USD" && !paystackUsdEnabled()) {
    return jsonError("USD certificate payments are not available yet.", 400);
  }
  // Server-owned amount: ignore any client-supplied price. USD uses fixed regional map, not FX.
  const currency = requestedCurrency;
  const chargeAmount =
    currency === "USD"
      ? learnCertificateUsdToCents(learnCertificateUsdFromNgn(priceNgn))
      : nairaToKobo(priceNgn);
  const pricingMode = (path as { certificate_pricing_mode?: string | null }).certificate_pricing_mode;

  // Free certificates: issue immediately after completion verification (no Paystack).
  if (pricingMode === "free" || chargeAmount <= 0) {
    if (pricingMode !== "free") {
      return jsonError("Certificate price is not set.", 400);
    }
    let checkoutEmail = params.profile?.email?.trim().toLowerCase() ?? "";
    let checkoutName = params.profile?.full_name?.trim() ?? "";
    if (!checkoutEmail && params.body.email?.trim()) {
      checkoutEmail = params.body.email.trim().toLowerCase();
      checkoutName = params.body.fullName?.trim() ?? checkoutName;
    }
    if (!isValidStudentEmail(checkoutEmail) || checkoutName.length < 2) {
      return jsonError("Enter your full name and email to claim your free certificate.", 400);
    }

    let studentId = params.userId;
    if (!studentId) {
      try {
        const resolved = await resolveOrCreateStudentForPurchase(params.admin, {
          email: checkoutEmail,
          fullName: checkoutName,
        });
        studentId = resolved.studentId;
        checkoutName = resolved.fullName || checkoutName;
      } catch (err) {
        return jsonError(err instanceof Error ? err.message : "Could not create account.", 400);
      }
    }
    if (!studentId) {
      return jsonError("Could not resolve a student account for this certificate.", 400);
    }

    const cert = await issueLearningPathCertificate({
      studentId,
      learningPathId: path.id,
      recipientName: checkoutName,
      sendEmail: true,
    });
    if (!cert) return jsonError("Could not issue certificate.", 500);
    const response = NextResponse.json({
      alreadyOwned: true,
      certificateId: cert.id,
      buyerEmail: checkoutEmail,
      free: true,
    });
    if (setDeviceCookie && deviceKey) {
      response.cookies.set(LEARN_DEVICE_COOKIE, deviceKey, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 400,
      });
    }
    return response;
  }

  if (!(await paystackConfigured())) {
    return jsonError(
      "Paystack is not configured. Save your Paystack secret key under Admin → Settings → Integrations.",
      503,
    );
  }

  let checkoutEmail = params.profile?.email?.trim().toLowerCase() ?? "";
  let checkoutName = params.profile?.full_name?.trim() ?? "";
  if (!checkoutEmail && params.body.email?.trim()) {
    checkoutEmail = params.body.email.trim().toLowerCase();
    checkoutName = params.body.fullName?.trim() ?? checkoutName;
  }

  if (!params.userId || !params.profile?.email) {
    if (!isValidStudentEmail(checkoutEmail)) {
      return jsonError("Enter your email address before checkout.", 400);
    }
    if (checkoutName.length < 2) {
      return jsonError("Enter your full name before checkout.", 400);
    }
  } else if (!checkoutEmail) {
    return jsonError("Add an email address to your profile before checkout.", 400);
  }

  if (isValidStudentEmail(checkoutEmail)) {
    const existingProfile = await findProfileByEmail(params.admin, checkoutEmail);
    if (existingProfile) {
      const { data: existingCert, error: certError } = await params.admin
        .from("certificates")
        .select("id")
        .eq("student_id", existingProfile.id)
        .eq("learning_path_id", path.id)
        .eq("is_valid", true)
        .maybeSingle();
      if (certError && !isMissingColumnError(certError.message)) {
        return jsonError(certError.message, 500);
      }
      if (existingCert) {
        const response = NextResponse.json({
          alreadyOwned: true,
          certificateId: existingCert.id,
          buyerEmail: checkoutEmail,
        });
        if (setDeviceCookie && deviceKey) {
          response.cookies.set(LEARN_DEVICE_COOKIE, deviceKey, {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 60 * 60 * 24 * 400,
          });
        }
        return response;
      }
    }
  }

  const reference = generateReference();
  const storeCheckoutDetails = !params.userId || !params.profile?.email;
  const paystackData = buildLearningPathCheckoutPayload({
    learningPathId: path.id,
    checkoutEmail: storeCheckoutDetails ? checkoutEmail : undefined,
    checkoutName: storeCheckoutDetails ? checkoutName : undefined,
  });

  const { error: txError } = await params.admin.from("transactions").insert({
    student_id: params.userId,
    course_id: null,
    learning_path_id: path.id,
    amount: chargeAmount,
    currency,
    reference,
    status: "pending",
    paystack_data: paystackData as Json,
  });

  if (txError) {
    if (isMissingColumnError(txError.message) || /learning_path_id|commerce_target/i.test(txError.message)) {
      return jsonError(
        "Learning path certificates are not enabled on this database yet. Apply sql/apply-learning-path-certificates.sql.",
        503,
      );
    }
    return jsonError(txError.message, 500);
  }

  const metadata: Record<string, string> = {
    learning_path_id: path.id,
    currency,
    certificate_price_ngn: String(priceNgn),
    buyer_email: checkoutEmail,
    buyer_full_name: checkoutName,
  };
  if (params.userId) metadata.student_id = params.userId;

  let init;
  try {
    init = await initializeTransaction({
      email: checkoutEmail,
      amountMinor: chargeAmount,
      currency,
      reference,
      callbackUrl: `${siteUrl()}/learn/${path.slug}?payment=success`,
      metadata,
      customerName: checkoutName || undefined,
    });
  } catch (err) {
    await params.admin.from("transactions").update({ status: "failed" }).eq("reference", reference);
    return jsonError(err instanceof Error ? err.message : "Paystack initialization failed.", 502);
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
  if (setDeviceCookie && deviceKey) {
    response.cookies.set(LEARN_DEVICE_COOKIE, deviceKey, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }
  return response;
}
